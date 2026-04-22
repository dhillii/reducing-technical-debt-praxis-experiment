/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Show an error message if the element exists.
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Apply error styling and display a message.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Guard predicate: should include OTC flow.
 */
function shouldIncludeOTC(emailType, dataset) {
    return emailType === 'signin' && dataset?.membersOtc === 'true';
}

/**
 * Guard predicate: has URL history.
 */
function hasUrlHistory(urlHistory) {
    return !!urlHistory;
}

/**
 * Guard predicate: newsletter inputs exist.
 */
function hasNewsletterInputs(inputs) {
    return inputs && inputs.length > 0;
}

/**
 * Guard predicate: checkable newsletter inputs exist.
 */
function hasCheckableNewsletterInputs(target) {
    return target.querySelectorAll('input[type=checkbox][data-members-newsletter]').length > 0;
}

/**
 * Guard predicate: response is successful.
 */
function isSuccessfulResponse(res) {
    return res.ok;
}

/**
 * Form submit handler.
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
    const emailType = form.dataset?.membersForm || undefined;

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(el => el.value);
    const newsletters = Array.from(event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    )).map(el => ({name: el.value}));

    const wantsOTC = shouldIncludeOTC(emailType, form.dataset);
    const urlHistory = getUrlHistory();

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        ...(wantsOTC && {includeOTC: true}),
        ...(hasUrlHistory(urlHistory) && {urlHistory}),
        ...(hasNewsletterInputs(newsletters) && {newsletters})
    };

    if (!hasNewsletterInputs(newsletters) && hasCheckableNewsletterInputs(event.target)) {
        reqBody.newsletters = [];
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

        if (isSuccessfulResponse(magicLinkRes)) {
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
 * Guard predicate: response is ok.
 */
function responseOk(res) {
    return res.ok;
}

/**
 * Plan click handler.
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
    if (hasUrlHistory(urlHistory)) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        if (!responseOk(sessionRes)) {
            throw new Error(t('Failed to obtain session'));
        }
        const identity = await sessionRes.text();

        const checkoutRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

        if (!responseOk(checkoutRes)) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const responseBody = await checkoutRes.json();

        if (responseBody.url) {
            window.location.assign(responseBody.url);
            return;
        }

        const stripe = window.Stripe(responseBody.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
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
 * Generic async click handler creator for fetch‑based flows.
 */
function createAsyncClickHandler({
    el,
    errorEl,
    siteUrl,
    endpoint,
    bodyBuilder,
    successRedirect,
    onErrorMessage
}) {
    return async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        el.classList.add('loading');

        try {
            const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
            if (!responseOk(sessionRes)) {
                throw new Error(t('Failed to obtain session'));
            }
            const identity = await sessionRes.text();

            const apiRes = await fetch(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(bodyBuilder(identity))
            });

            if (!responseOk(apiRes)) {
                throw new Error(onErrorMessage);
            }

            const result = await apiRes.json();

            if (successRedirect) {
                successRedirect(result);
                return;
            }

            // Default: redirect to Stripe checkout
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
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
    };
}

/**
 * Main data‑attributes handler.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

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
            planClickHandler({el, event, errorEl, siteUrl, site, member, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess ? (new URL(el.dataset.membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = el.dataset.membersCancel ? (new URL(el.dataset.membersCancel, window.location.href)).href : undefined;

        const clickHandler = createAsyncClickHandler({
            el,
            errorEl,
            siteUrl,
            endpoint: `${siteUrl}/members/api/create-stripe-update-session/`,
            bodyBuilder: identity => ({identity, successUrl, cancelUrl}),
            successRedirect: result => {
                const stripe = window.Stripe(result.publicKey);
                stripe.redirectToCheckout({sessionId: result.sessionId});
            },
            onErrorMessage: t('Could not create stripe checkout session')
        });

        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn ? (new URL(el.dataset.membersReturn, window.location.href)).href : undefined;

        const clickHandler = createAsyncClickHandler({
            el,
            errorEl,
            siteUrl,
            endpoint: `${siteUrl}/members/api/create-stripe-billing-portal-session/`,
            bodyBuilder: identity => ({identity, returnUrl}),
            successRedirect: result => window.location.assign(result.url),
            onErrorMessage: t('Could not create Stripe billing portal session')
        });

        el.addEventListener('click', clickHandler);
    });

    // Signout
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
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
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Cancel subscription
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
            if (errorEl) {
                errorEl.innerText = '';
            }

            try {
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
                if (!responseOk(sessionRes)) {
                    throw new Error(t('Failed to obtain session'));
                }
                const identity = await sessionRes.text();

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
                    if (errorEl) {
                        errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                    }
                }
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
            }
        };
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            const subscriptionId = el.dataset.membersContinueSubscription;
            if (errorEl) {
                errorEl.innerText = '';
            }

            try {
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
                if (!responseOk(sessionRes)) {
                    throw new Error(t('Failed to obtain session'));
                }
                const identity = await sessionRes.text();

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
                    if (errorEl) {
                        errorEl.innerText = t('There was an error continuing your subscription, please try again.');
                    }
                }
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
            }
        };
        el.addEventListener('click', clickHandler);
    });
}