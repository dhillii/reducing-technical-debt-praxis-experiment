/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles generic errors for form submissions.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Retrieves the session identity token from the Ghost API.
 */
async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    if (!res.ok) {
        return null;
    }
    return await res.text();
}

/**
 * Creates a Stripe checkout session using the provided request data.
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
    return await res.json();
}

/**
 * Redirects the user based on the Stripe checkout response.
 */
async function handleStripeRedirect(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

/**
 * Handles form submission for magic link sign‑in.
 */
export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
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

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(el => el.value);
    const newsletters = Array.from(event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'))
        .map(el => ({name: el.value}));

    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        urlHistory: getUrlHistory() || undefined,
        includeOTC: wantsOTC || undefined,
        newsletters: newsletters.length ? newsletters : undefined
    };

    // Ensure empty newsletters array when only checkable inputs exist but none are checked
    if (!newsletters.length) {
        const checkable = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkable.length) {
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
            const apiError = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(apiError, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Handles click on a plan element to start a Stripe checkout flow.
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
        const identity = await fetchSessionIdentity(siteUrl);
        const responseBody = await createStripeCheckoutSession(
            siteUrl,
            requestData,
            identity,
            checkoutSuccessUrl,
            checkoutCancelUrl,
            metadata
        );
        await handleStripeRedirect(responseBody);
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

/**
 * Generic helper to fetch a Stripe session (checkout, update, or billing portal).
 */
async function fetchStripeSession(url, payload) {
    const res = await fetch(url, {
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
 * Handles click for edit‑billing elements.
 */
async function handleEditBillingClick({el, event, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const result = await fetchStripeSession(`${siteUrl}/members/api/create-stripe-update-session/`, {
            identity,
            successUrl,
            cancelUrl
        });
        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
        if (redirectResult.error) {
            throw new Error(t(redirectResult.error.message));
        }
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

/**
 * Handles click for manage‑billing elements.
 */
async function handleManageBillingClick({el, event, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const result = await fetchStripeSession(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            identity,
            returnUrl
        });
        window.location.assign(result.url);
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

/**
 * Handles click for sign‑out elements.
 */
async function handleSignoutClick({el, event, siteUrl, clickHandler}) {
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

/**
 * Handles click for cancel‑subscription elements.
 */
async function handleCancelSubscriptionClick({el, event, siteUrl, subscriptionId, errorEl, clickHandler, hasRetentionOffers, doAction}) {
    event.preventDefault();

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
    if (errorEl) {
        errorEl.innerText = '';
    }

    const identity = await fetchSessionIdentity(siteUrl);
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
        if (errorEl) {
            errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
        }
    }
}

/**
 * Handles click for continue‑subscription elements.
 */
async function handleContinueSubscriptionClick({el, event, siteUrl, subscriptionId, errorEl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    const identity = await fetchSessionIdentity(siteUrl);
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
        if (errorEl) {
            errorEl.innerText = t('There was an error continuing your subscription, please try again.');
        }
    }
}

/**
 * Initializes data‑attribute handlers across the page.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // Form handlers
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Plan click handlers
    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({event, el, errorEl, member, site, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Edit billing handlers
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess ? (new URL(el.dataset.membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = el.dataset.membersCancel ? (new URL(el.dataset.membersCancel, window.location.href)).href : undefined;
        const clickHandler = event => {
            handleEditBillingClick({el, event, errorEl, siteUrl, successUrl, cancelUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Manage billing handlers
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn ? (new URL(el.dataset.membersReturn, window.location.href)).href : undefined;
        const clickHandler = event => {
            handleManageBillingClick({el, event, errorEl, siteUrl, returnUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Sign‑out handlers
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = event => {
            handleSignoutClick({el, event, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Cancel subscription handlers
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            const subscriptionId = el.dataset.membersCancelSubscription;
            handleCancelSubscriptionClick({
                el,
                event,
                siteUrl,
                subscriptionId,
                errorEl,
                clickHandler,
                hasRetentionOffers,
                doAction
            });
        };
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription handlers
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            const subscriptionId = el.dataset.membersContinueSubscription;
            handleContinueSubscriptionClick({
                el,
                event,
                siteUrl,
                subscriptionId,
                errorEl,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });
}