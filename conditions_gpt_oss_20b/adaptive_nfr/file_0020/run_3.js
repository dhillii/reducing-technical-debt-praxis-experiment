/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Sets the inner text of an error element if it exists.
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles an error by adding an error class to the form and displaying a message.
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
 * @typedef {Object} FormSubmitParams
 * @property {Event} event
 * @property {HTMLFormElement} form
 * @property {HTMLElement|null} errorEl
 * @property {string} siteUrl
 * @property {Function} submitHandler
 * @property {Function} doAction
 * @property {Function} captureException
 */

/**
 * Handles form submission for member forms.
 * @param {FormSubmitParams} params
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
    let emailType = undefined;
    const labels = [];
    const newsletters = [];

    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }

    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }

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
        autoRedirect: autoRedirect === 'true'
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
        const checkableNewsletterInputs = event.target.querySelectorAll(
            'input[type=checkbox][data-members-newsletter]'
        ) || [];
        if (checkableNewsletterInputs.length > 0) {
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
 * @typedef {Object} PlanClickParams
 * @property {Event} event
 * @property {HTMLElement} el
 * @property {HTMLElement|null} errorEl
 * @property {string} siteUrl
 * @property {Object} site
 * @property {Object|null} member
 * @property {Function} clickHandler
 */

/**
 * Determines if a URL string is defined and non-empty.
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
function isUrlDefined(url) {
    return typeof url === 'string' && url.trim() !== '';
}

/**
 * Determines if a response is OK.
 * @param {Response} res
 * @returns {boolean}
 */
function isResponseOk(res) {
    return res.ok;
}

/**
 * Determines if a redirect result contains an error.
 * @param {Object} redirectResult
 * @returns {boolean}
 */
function isRedirectError(redirectResult) {
    return redirectResult && redirectResult.error;
}

/**
 * Handles the plan click event, creating a Stripe checkout session.
 * @param {PlanClickParams} params
 * @returns {Promise<void>}
 */
export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    let checkoutSuccessUrl;
    let checkoutCancelUrl;

    if (isUrlDefined(successUrl)) {
        checkoutSuccessUrl = new URL(successUrl, window.location.href).href;
    }

    if (isUrlDefined(cancelUrl)) {
        checkoutCancelUrl = new URL(cancelUrl, window.location.href).href;
    }

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
        if (!isResponseOk(sessionRes)) {
            throw new Error('Failed to fetch session');
        }
        const identity = await sessionRes.text();

        const stripeRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

        if (!isResponseOk(stripeRes)) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const responseBody = await stripeRes.json();

        if (responseBody.url) {
            window.location.assign(responseBody.url);
            return;
        }

        const stripe = window.Stripe(responseBody.publicKey);
        const redirectResult = await stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        });

        if (isRedirectError(redirectResult)) {
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
 * @typedef {Object} HandleDataAttributesParams
 * @property {string} siteUrl
 * @property {Object} site
 * @property {Object|null} member
 * @property {Array} offers
 * @property {Function} doAction
 * @property {Function} captureException
 */

/**
 * Handles data attributes for member-related actions.
 * @param {HandleDataAttributesParams} [params={}]
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        let successUrl;
        let cancelUrl;

        if (isUrlDefined(membersSuccess)) {
            successUrl = new URL(membersSuccess, window.location.href).href;
        }

        if (isUrlDefined(membersCancel)) {
            cancelUrl = new URL(membersCancel, window.location.href).href;
        }

        async function clickHandler(event) {
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
                if (!isResponseOk(sessionRes)) {
                    throw new Error('Failed to fetch session');
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

                if (!isResponseOk(updateRes)) {
                    throw new Error(t('Could not create stripe checkout session'));
                }

                const result = await updateRes.json();
                const stripe = window.Stripe(result.publicKey);
                const redirectResult = await stripe.redirectToCheckout({
                    sessionId: result.sessionId
                });

                if (isRedirectError(redirectResult)) {
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
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        let returnUrl;

        if (isUrlDefined(membersReturn)) {
            returnUrl = new URL(membersReturn, window.location.href).href;
        }

        async function clickHandler(event) {
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
                if (!isResponseOk(sessionRes)) {
                    throw new Error('Failed to fetch session');
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

                if (!isResponseOk(portalRes)) {
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
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        async function clickHandler(event) {
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
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
            }
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        async function clickHandler(event) {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction('openPopup', {
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
                if (!isResponseOk(sessionRes)) {
                    throw new Error('Failed to fetch session');
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
                    throw new Error('Cancellation failed');
                }
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) {
                    errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                }
            }
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        async function clickHandler(event) {
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
                if (!isResponseOk(sessionRes)) {
                    throw new Error('Failed to fetch session');
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
                    throw new Error('Continuation failed');
                }
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) {
                    errorEl.innerText = t('There was an error continuing your subscription, please try again.');
                }
            }
        }
        el.addEventListener('click', clickHandler);
    });
}