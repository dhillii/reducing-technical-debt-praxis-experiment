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
 * Extract values from form inputs.
 */
function extractFormData(event) {
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
 * Build request payload for magic‑link endpoint.
 */
function buildRequestBody({email, name, labels, newsletters, newsletterInputs, form, siteUrl}) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset?.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    const urlHistory = getUrlHistory();
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        // No newsletters selected – ensure empty array if any checkable inputs exist
        const checkable = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkable.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return {reqBody, wantsOTC};
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
async function sendMagicLink(siteUrl, body) {
    return await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
}

/**
 * Process successful magic‑link response, handling OTC if required.
 */
async function processMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, errorEl, form) {
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
}

/**
 * Main submit handler for member forms.
 */
export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) errorEl.innerText = '';
    form.classList.remove('success', 'invalid', 'error');

    const {email, name, labels, newsletters, newsletterInputs} = extractFormData(event);
    const {reqBody, wantsOTC} = buildRequestBody({email, name, labels, newsletters, newsletterInputs, form, siteUrl});

    form.classList.add('loading');

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, {...reqBody, integrityToken});

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            await processMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, errorEl, form);
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
 * Resolve success / cancel URLs for plan clicks.
 */
function resolvePlanUrls(el) {
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;
    return {checkoutSuccessUrl, checkoutCancelUrl};
}

/**
 * Fetch identity token from Ghost API.
 */
function fetchIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => (res.ok ? res.text() : null));
}

/**
 * Create Stripe checkout session.
 */
function createCheckoutSession(siteUrl, requestData, identity, urls, metadata) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl: urls.checkoutSuccessUrl,
            cancelUrl: urls.checkoutCancelUrl,
            metadata
        })
    }).then(res => {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

/**
 * Redirect to Stripe checkout or session URL.
 */
function redirectToStripe(responseBody) {
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
 * Click handler for plan elements.
 */
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const {checkoutSuccessUrl, checkoutCancelUrl} = resolvePlanUrls(el);
    if (errorEl) errorEl.innerText = '';
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    fetchIdentity(siteUrl)
        .then(identity => createCheckoutSession(siteUrl, requestData, identity, {checkoutSuccessUrl, checkoutCancelUrl}, metadata))
        .then(redirectToStripe)
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        });
}

/**
 * Generic fetch‑then‑json helper.
 */
function fetchJson(url, options) {
    return fetch(url, options).then(res => {
        if (!res.ok) {
            throw new Error(t('Network request failed'));
        }
        return res.json();
    });
}

/**
 * Click handler for edit‑billing elements.
 */
function handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    el.classList.add('loading');
    if (errorEl) errorEl.innerText = '';

    fetchIdentity(siteUrl)
        .then(identity => fetchJson(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, successUrl, cancelUrl})
        }))
        .then(result => {
            const stripe = window.Stripe(result.publicKey);
            return stripe.redirectToCheckout({sessionId: result.sessionId});
        })
        .then(res => {
            if (res.error) {
                throw new Error(t(res.error.message));
            }
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        });
}

/**
 * Click handler for manage‑billing elements.
 */
function handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    el.classList.add('loading');
    if (errorEl) errorEl.innerText = '';

    fetchIdentity(siteUrl)
        .then(identity => fetchJson(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, returnUrl})
        }))
        .then(result => {
            window.location.assign(result.url);
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) errorEl.innerText = err.message;
            el.classList.add('error');
        });
}

/**
 * Click handler for sign‑out elements.
 */
function handleSignoutClick({el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');

    fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
        .then(res => {
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
            }
        });
}

/**
 * Click handler for cancel‑subscription elements.
 */
function handleCancelSubscriptionClick({el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler}) {
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

    fetchIdentity(siteUrl)
        .then(identity => fetchJson(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, smart_cancel: true})
        }))
        .then(() => {
            window.location.reload();
        })
        .catch(() => {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
        });
}

/**
 * Click handler for continue‑subscription elements.
 */
function handleContinueSubscriptionClick({el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');
    if (errorEl) errorEl.innerText = '';

    fetchIdentity(siteUrl)
        .then(identity => fetchJson(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, cancel_at_period_end: false})
        }))
        .then(() => {
            window.location.reload();
        })
        .catch(() => {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) errorEl.innerText = t('There was an error continuing your subscription, please try again.');
        });
}

/**
 * Initialise data‑attribute driven behaviours.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) return;
    siteUrl = siteUrl.replace(/\/$/, '');

    // Form submissions
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException});
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

    // Sign out
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
        const subscriptionId = el.dataset.membersCancelSubscription;
        const clickHandler = event => {
            handleCancelSubscriptionClick({
                el,
                errorEl,
                siteUrl,
                subscriptionId,
                hasRetentionOffers,
                doAction,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;
        const clickHandler = event => {
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