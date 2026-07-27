/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Display an error message if the element exists.
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handle generic errors for form submissions.
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
 * Guard predicate: checks if fetch response is ok.
 * @param {Response} response
 * @returns {boolean}
 */
function isOkResponse(response) {
    return response.ok;
}

/**
 * Guard predicate: checks if a response body contains a URL.
 * @param {object} body
 * @returns {boolean}
 */
function hasUrl(body) {
    return !!body?.url;
}

/**
 * Guard predicate: checks if Stripe redirect result contains an error.
 * @param {object} result
 * @returns {boolean}
 */
function hasRedirectError(result) {
    return !!result?.error;
}

/**
 * Guard predicate: checks if an object has an OTC reference.
 * @param {object} body
 * @returns {boolean}
 */
function hasOtcRef(body) {
    return !!body?.otc_ref;
}

/**
 * Guard predicate: checks if a newsletter input list is non‑empty.
 * @param {NodeListOf<Element>} inputs
 * @returns {boolean}
 */
function hasNewsletterInputs(inputs) {
    return inputs.length > 0;
}

/**
 * Guard predicate: checks if there are checkable newsletter inputs.
 * @param {NodeListOf<Element>} inputs
 * @returns {boolean}
 */
function hasCheckableNewsletterInputs(inputs) {
    return inputs.length > 0;
}

/**
 * Guard predicate: checks if a retention offer exists.
 * @param {Array} offers
 * @returns {boolean}
 */
function hasRetentionOffers(offers) {
    return (offers || []).some(offer => offer.redemption_type === 'retention');
}

/**
 * Handles the click for a plan button.
 * @param {object} param0
 * @param {Event} param0.event
 * @param {HTMLElement} param0.el
 * @param {HTMLElement|null} param0.errorEl
 * @param {string} param0.siteUrl
 * @param {object} param0.site
 * @param {object|null} param0.member
 * @param {Function} param0.clickHandler
 * @returns {Promise<void>}
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
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        if (!isOkResponse(sessionRes)) {
            throw new Error(t('Failed to obtain session identity'));
        }
        const identity = await sessionRes.text();

        const createRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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
        if (!isOkResponse(createRes)) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        const responseBody = await createRes.json();

        if (hasUrl(responseBody)) {
            window.location.assign(responseBody.url);
            return;
        }

        const stripe = window.Stripe(responseBody.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        if (hasRedirectError(redirectResult)) {
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
 * Handles click for edit‑billing elements.
 * @param {object} param0
 * @param {Event} param0.event
 * @param {HTMLElement} param0.el
 * @param {HTMLElement|null} param0.errorEl
 * @param {string} param0.siteUrl
 * @param {string|undefined} param0.successUrl
 * @param {string|undefined} param0.cancelUrl
 * @param {Function} param0.clickHandler
 * @returns {Promise<void>}
 */
async function editBillingClickHandler({event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        if (!isOkResponse(sessionRes)) {
            throw new Error(t('Failed to obtain session identity'));
        }
        const identity = await sessionRes.text();

        const createRes = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, successUrl, cancelUrl})
        });
        if (!isOkResponse(createRes)) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        const result = await createRes.json();

        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
        if (hasRedirectError(redirectResult)) {
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
 * @param {object} param0
 * @param {Event} param0.event
 * @param {HTMLElement} param0.el
 * @param {HTMLElement|null} param0.errorEl
 * @param {string} param0.siteUrl
 * @param {string|undefined} param0.returnUrl
 * @param {Function} param0.clickHandler
 * @returns {Promise<void>}
 */
async function manageBillingClickHandler({event, el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
        if (!isOkResponse(sessionRes)) {
            throw new Error(t('Failed to obtain session identity'));
        }
        const identity = await sessionRes.text();

        const createRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, returnUrl})
        });
        if (!isOkResponse(createRes)) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }
        const result = await createRes.json();

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
 * @param {object} param0
 * @param {Event} param0.event
 * @param {HTMLElement} param0.el
 * @param {string} param0.siteUrl
 * @param {Function} param0.clickHandler
 * @returns {Promise<void>}
 */
async function signoutClickHandler({event, el, siteUrl, clickHandler}) {
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
}

/**
 * Handles click for cancel‑subscription elements.
 * @param {object} param0
 * @param {Event} param0.event
 * @param {HTMLElement} param0.el
 * @param {HTMLElement|null} param0.errorEl
 * @param {string} param0.siteUrl
 * @param {Array} param0.offers
 * @param {Function} param0.doAction
 * @param {Function} param0.clickHandler
 * @returns {Promise<void>}
 */
async function cancelSubscriptionClickHandler({event, el, errorEl, siteUrl, offers, doAction, clickHandler}) {
    event.preventDefault();

    const subscriptionId = el.dataset.membersCancelSubscription;

    if (hasRetentionOffers(offers)) {
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
        if (!isOkResponse(sessionRes)) {
            throw new Error(t('Failed to obtain session identity'));
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
}

/**
 * Handles click for continue‑subscription elements.
 * @param {object} param0
 * @param {Event} param0.event
 * @param {HTMLElement} param0.el
 * @param {HTMLElement|null} param0.errorEl
 * @param {string} param0.siteUrl
 * @param {Function} param0.clickHandler
 * @returns {Promise<void>}
 */
async function continueSubscriptionClickHandler({event, el, errorEl, siteUrl, clickHandler}) {
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
        if (!isOkResponse(sessionRes)) {
            throw new Error(t('Failed to obtain session identity'));
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
}

/**
 * Main entry point for handling data‑attributes.
 * @param {object} param0
 * @param {string} param0.siteUrl
 * @param {object} [param0.site={}]
 * @param {object|null} [param0.member]
 * @param {Array} [param0.offers=[]]
 * @param {Function} param0.doAction
 * @param {Function} param0.captureException
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = async function (event) {
            await formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = async function (event) {
            await planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;
        const clickHandler = async function (event) {
            await editBillingClickHandler({event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;
        const clickHandler = async function (event) {
            await manageBillingClickHandler({event, el, errorEl, siteUrl, returnUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        const clickHandler = async function (event) {
            await signoutClickHandler({event, el, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    const retentionOffers = hasRetentionOffers(offers);

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = async function (event) {
            await cancelSubscriptionClickHandler({event, el, errorEl, siteUrl, offers, doAction, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = async function (event) {
            await continueSubscriptionClickHandler({event, el, errorEl, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Handles form submission for the members form.
 * @param {object} param0
 * @param {Event} param0.event
 * @param {HTMLFormElement} param0.form
 * @param {HTMLElement|null} param0.errorEl
 * @param {string} param0.siteUrl
 * @param {Function} param0.submitHandler
 * @param {Function} param0.doAction
 * @param {Function} param0.captureException
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
    let emailType;
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
        autoRedirect: (autoRedirect === 'true')
    };
    if (wantsOTC) {
        reqBody.includeOTC = true;
    }
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }
    if (hasNewsletterInputs(newsletterInputs)) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (hasCheckableNewsletterInputs(checkableNewsletterInputs)) {
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

            if (hasOtcRef(responseBody) && typeof doAction === 'function') {
                try {
                    doAction('startSigninOTCFromCustomForm', {
                        email: (email || '').trim(),
                        otcRef: responseBody.otc_ref,
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