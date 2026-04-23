/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Sets the error message on the provided element if it exists.
 * @param {HTMLElement | null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles generic errors during form submission.
 * @param {Error} error
 * @param {HTMLFormElement} form
 * @param {HTMLElement | null} errorEl
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Predicate: checks if the email type is 'signin'.
 * @param {string | undefined} emailType
 * @returns {boolean}
 */
function isEmailTypeSignin(emailType) {
    return emailType === 'signin';
}

/**
 * Predicate: determines if the form wants an OTC flow.
 * @param {string | undefined} emailType
 * @param {string | undefined} otcFlag
 * @returns {boolean}
 */
function wantsOTC(emailType, otcFlag) {
    return isEmailTypeSignin(emailType) && otcFlag === 'true';
}

/**
 * Predicate: checks if there are checkable newsletter inputs.
 * @param {NodeListOf<HTMLInputElement>} inputs
 * @returns {boolean}
 */
function hasCheckableNewsletterInputs(inputs) {
    return inputs.length > 0;
}

/**
 * Predicate: checks if a fetch response is successful.
 * @param {Response} res
 * @returns {boolean}
 */
function isSuccessResponse(res) {
    return res.ok;
}

/**
 * Predicate: checks if a fetch response is ok.
 * @param {Response} res
 * @returns {boolean}
 */
function isOkResponse(res) {
    return res.ok;
}

/**
 * Handles form submission for member forms.
 * @param {Object} params
 * @param {Event} params.event
 * @param {HTMLFormElement} params.form
 * @param {HTMLElement | null} params.errorEl
 * @param {string} params.siteUrl
 * @param {Function} params.submitHandler
 * @param {Function} params.doAction
 * @param {Function} params.captureException
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

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    let emailType = undefined;
    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(el => el.value);
    const newsletters = Array.from(
        event.target.querySelectorAll(
            'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
        )
    ).map(el => ({name: el.value}));

    if (form.dataset.membersForm) {
        emailType = form.dataset.membersForm;
    }

    const wantsOTCFlow = wantsOTC(emailType, form?.dataset?.membersOtc);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTCFlow) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs(event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]'))) {
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

        if (isOkResponse(magicLinkRes)) {
            form.classList.add('success');

            let responseBody;
            if (wantsOTCFlow) {
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

/**
 * Handles click events on plan elements.
 * @param {Object} params
 * @param {Event} params.event
 * @param {HTMLElement} params.el
 * @param {HTMLElement | null} params.errorEl
 * @param {string} params.siteUrl
 * @param {Object} params.site
 * @param {Object} params.member
 * @param {Function} params.clickHandler
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
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!isSuccessResponse(sessionRes)) {
            throw new Error(t('Could not create stripe checkout session'));
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

        if (!isOkResponse(checkoutRes)) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const responseBody = await checkoutRes.json();

        if (responseBody.url) {
            window.location.assign(responseBody.url);
        } else {
            const stripe = window.Stripe(responseBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            });

            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
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
 * Initializes data attribute handlers for member-related elements.
 * @param {Object} params
 * @param {string} params.siteUrl
 * @param {Object} [params.site={}]
 * @param {Object} [params.member]
 * @param {Array} [params.offers=[]]
 * @param {Function} [params.doAction]
 * @param {Function} [params.captureException]
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

    // Form handlers
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Plan handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({el, event, errorEl, site, siteUrl, member, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Edit billing handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? new URL(membersSuccess, window.location.href).href : undefined;
        const cancelUrl = membersCancel ? new URL(membersCancel, window.location.href).href : undefined;

        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }

            el.classList.add('loading');

            try {
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
                    credentials: 'same-origin'
                });

                if (!isSuccessResponse(sessionRes)) {
                    throw new Error(t('Could not create stripe checkout session'));
                }

                const identity = await sessionRes.text();

                const updateRes = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        identity,
                        successUrl,
                        cancelUrl
                    })
                });

                if (!isOkResponse(updateRes)) {
                    throw new Error(t('Could not create stripe checkout session'));
                }

                const result = await updateRes.json();

                const stripe = window.Stripe(result.publicKey);
                const redirectResult = await stripe.redirectToCheckout({
                    sessionId: result.sessionId
                });

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
        };

        el.addEventListener('click', clickHandler);
    });

    // Manage billing handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? new URL(membersReturn, window.location.href).href : undefined;

        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }

            el.classList.add('loading');

            try {
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
                    credentials: 'same-origin'
                });

                if (!isSuccessResponse(sessionRes)) {
                    throw new Error(t('Could not create Stripe billing portal session'));
                }

                const identity = await sessionRes.text();

                const portalRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        identity,
                        returnUrl
                    })
                });

                if (!isOkResponse(portalRes)) {
                    throw new Error(t('Could not create Stripe billing portal session'));
                }

                const result = await portalRes.json();

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
        };

        el.addEventListener('click', clickHandler);
    });

    // Signout handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), el => {
        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            el.classList.remove('error');
            el.classList.add('loading');

            try {
                const res = await fetch(`${siteUrl}/members/api/session`, {
                    method: 'DELETE'
                });

                if (res.ok) {
                    window.location.replace(siteUrl);
                } else {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                }
            } catch {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
            }
        };

        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Cancel subscription handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        const clickHandler = async event => {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction?.('openPopup', {
                    page: 'accountPlan',
                    pageData: {
                        subscriptionId,
                        action: 'cancel'
                    }
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
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
                    credentials: 'same-origin'
                });

                if (!isSuccessResponse(sessionRes)) {
                    throw new Error();
                }

                const identity = await sessionRes.text();

                const cancelRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        identity,
                        smart_cancel: true
                    })
                });

                if (cancelRes.ok) {
                    window.location.reload();
                } else {
                    throw new Error();
                }
            } catch {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');

                if (errorEl) {
                    errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                }
            }
        };

        el.addEventListener('click', clickHandler);
    });

    // Continue subscription handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), el => {
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
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
                    credentials: 'same-origin'
                });

                if (!isSuccessResponse(sessionRes)) {
                    throw new Error();
                }

                const identity = await sessionRes.text();

                const continueRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        identity,
                        cancel_at_period_end: false
                    })
                });

                if (continueRes.ok) {
                    window.location.reload();
                } else {
                    throw new Error();
                }
            } catch {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');

                if (errorEl) {
                    errorEl.innerText = t('There was an error continuing your subscription, please try again.');
                }
            }
        };

        el.addEventListener('click', clickHandler);
    });
}