import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/* eslint-disable no-console */

/**
 * Sets the error message on the provided element if it exists.
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Adds the error class to the form and displays a user-friendly message.
 * @param {Error} error
 * @param {HTMLFormElement} form
 * @param {HTMLElement|null} errorEl
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Retrieves the integrity token from the server.
 * @param {string} siteUrl
 * @returns {Promise<string>}
 */
async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return res.text();
}

/**
 * Sends the magic link request to the server.
 * @param {Object} reqBody
 * @param {string} siteUrl
 * @returns {Promise<Response>}
 */
async function sendMagicLink(reqBody, siteUrl) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(reqBody)
    });
}

/**
 * Builds the request body for the magic link request.
 * @param {Event} event
 * @param {HTMLFormElement} form
 * @param {string} siteUrl
 * @returns {Object}
 */
function buildRequestBody(event, form, siteUrl) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(el => el.value);
    const newsletterInputs = Array.from(event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ));
    const newsletters = newsletterInputs.map(el => ({name: el.value}));

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
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return {reqBody, wantsOTC, email};
}

/**
 * Handles the successful magic link response.
 * @param {Response} magicLinkRes
 * @param {boolean} wantsOTC
 * @param {string} email
 * @param {Function} doAction
 * @param {Function} captureException
 * @param {HTMLFormElement} form
 */
async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, form) {
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
 * Handles the error response from the magic link request.
 * @param {Response} magicLinkRes
 * @param {HTMLElement|null} errorEl
 * @param {HTMLFormElement} form
 */
async function handleMagicLinkError(magicLinkRes, errorEl, form) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
    form.classList.add('error');
}

/**
 * Main form submit handler.
 * @param {Object} params
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
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');

    const {reqBody, wantsOTC, email} = buildRequestBody(event, form, siteUrl);

    form.classList.add('loading');

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink({...reqBody, integrityToken}, siteUrl);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException, form);
        } else {
            await handleMagicLinkError(magicLinkRes, errorEl, form);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Fetches the current session identity.
 * @param {string} siteUrl
 * @returns {Promise<string|null>}
 */
async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) {
        return null;
    }
    return res.text();
}

/**
 * Creates a Stripe checkout session.
 * @param {string} siteUrl
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
async function createStripeCheckoutSession(siteUrl, payload) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/**
 * Handles the Stripe checkout redirection.
 * @param {Object} responseBody
 */
async function redirectToStripeCheckout(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
    } else {
        const stripe = window.Stripe(responseBody.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
    }
}

/**
 * Main plan click handler.
 * @param {Object} params
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
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;

    const checkoutSuccessUrl = successUrl ? new URL(successUrl, window.location.href).href : undefined;
    const checkoutCancelUrl = cancelUrl ? new URL(cancelUrl, window.location.href).href : undefined;

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
        const identity = await fetchIdentity(siteUrl);
        const payload = {
            ...requestData,
            identity,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata
        };
        const responseBody = await createStripeCheckoutSession(siteUrl, payload);
        await redirectToStripeCheckout(responseBody);
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
 * Handles Stripe session creation and redirection for various actions.
 * @param {string} actionEndpoint
 * @param {Object} payload
 * @param {HTMLElement} el
 * @param {HTMLElement|null} errorEl
 * @param {string} siteUrl
 */
async function handleStripeSession(actionEndpoint, payload, el, errorEl, siteUrl) {
    el.removeEventListener('click', payload.clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetchIdentity(siteUrl);
        const res = await fetch(`${siteUrl}${actionEndpoint}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, ...payload.body})
        });
        if (!res.ok) {
            throw new Error(t(payload.errorMessage));
        }
        const result = await res.json();
        if (payload.redirect) {
            window.location.assign(result.url);
        } else {
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', payload.clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

/**
 * Initializes event listeners for data attributes.
 * @param {Object} params
 */
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

    // Form submission
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        form.addEventListener('submit', submitHandler);
    });

    // Plan click
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? new URL(membersSuccess, window.location.href).href : undefined;
        const cancelUrl = membersCancel ? new URL(membersCancel, window.location.href).href : undefined;

        const clickHandler = async event => {
            event.preventDefault();
            await handleStripeSession(
                '/members/api/create-stripe-update-session/',
                {
                    body: {successUrl, cancelUrl},
                    clickHandler,
                    errorMessage: 'Could not create stripe checkout session'
                },
                el,
                errorEl,
                siteUrl
            );
        };
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? new URL(membersReturn, window.location.href).href : undefined;

        const clickHandler = async event => {
            event.preventDefault();
            await handleStripeSession(
                '/members/api/create-stripe-billing-portal-session/',
                {
                    body: {returnUrl},
                    clickHandler,
                    errorMessage: 'Could not create Stripe billing portal session'
                },
                el,
                errorEl,
                siteUrl
            );
        };
        el.addEventListener('click', clickHandler);
    });

    // Signout
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), el => {
        const clickHandler = async event => {
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

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Cancel subscription
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), el => {
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

            await handleStripeSession(
                `/members/api/subscriptions/${subscriptionId}/`,
                {
                    body: {smart_cancel: true},
                    clickHandler,
                    errorMessage: '',
                    redirect: false
                },
                el,
                errorEl,
                siteUrl
            );
        };
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = async event => {
            event.preventDefault();
            const subscriptionId = el.dataset.membersContinueSubscription;

            await handleStripeSession(
                `/members/api/subscriptions/${subscriptionId}/`,
                {
                    body: {cancel_at_period_end: false},
                    clickHandler,
                    errorMessage: '',
                    redirect: false
                },
                el,
                errorEl,
                siteUrl
            );
        };
        el.addEventListener('click', clickHandler);
    });
}