/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Update error element text if it exists.
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Apply error styling and display a message.
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
 * Determine if the form wants an OTC flow.
 * @param {string|undefined} emailType
 * @param {HTMLFormElement} form
 * @returns {boolean}
 */
function isWantsOTC(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

/**
 * Determine if a URL history value exists.
 * @param {string|undefined} urlHistory
 * @returns {boolean}
 */
function hasUrlHistory(urlHistory) {
    return !!urlHistory;
}

/**
 * Determine if newsletter inputs were provided.
 * @param {NodeListOf<Element>} inputs
 * @returns {boolean}
 */
function hasNewsletterInputs(inputs) {
    return inputs && inputs.length > 0;
}

/**
 * Determine if any checkable newsletter inputs exist.
 * @param {Event} event
 * @returns {boolean}
 */
function hasCheckableNewsletterInputs(event) {
    const inputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return inputs && inputs.length > 0;
}

/**
 * Collect label values from the form event.
 * @param {Event} event
 * @returns {string[]}
 */
function collectLabels(event) {
    const labels = [];
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

/**
 * Collect newsletter selections from the form event.
 * @param {Event} event
 * @returns {{name: string}[]}
 */
function collectNewsletters(event) {
    const newsletters = [];
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return newsletters;
}

/**
 * Build the request body for the magic link API.
 * @param {object} params
 * @returns {object}
 */
function buildRequestBody(params) {
    const {
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters
    } = params;

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
    if (hasUrlHistory(urlHistory)) {
        body.urlHistory = urlHistory;
    }
    if (hasNewsletterInputs(newsletters)) {
        body.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs(params.event)) {
        body.newsletters = [];
    }

    return body;
}

/**
 * Handle a successful magic link response.
 * @param {object} args
 */
async function handleMagicLinkSuccess(args) {
    const {
        magicLinkRes,
        wantsOTC,
        email,
        doAction,
        captureException,
        form,
        errorEl
    } = args;

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
}

/**
 * Handle a failed magic link response.
 * @param {object} args
 */
async function handleMagicLinkFailure(args) {
    const {magicLinkRes, errorEl, form} = args;
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
    form.classList.add('error');
}

/**
 * Submit handler for member forms.
 * @param {object} param0
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
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = isWantsOTC(emailType, form);
    const labels = collectLabels(event);
    const newsletters = collectNewsletters(event);
    const urlHistory = getUrlHistory();

    const reqBody = buildRequestBody({
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters,
        event
    });

    form.classList.add('loading');

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
            await handleMagicLinkSuccess({
                magicLinkRes,
                wantsOTC,
                email,
                doAction,
                captureException,
                form,
                errorEl
            });
        } else {
            await handleMagicLinkFailure({magicLinkRes, errorEl, form});
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Determine if a fetch response is successful.
 * @param {Response} res
 * @returns {boolean}
 */
function isSuccessfulResponse(res) {
    return res.ok;
}

/**
 * Create a Stripe checkout session and redirect.
 * @param {object} args
 */
function redirectToStripe(args) {
    const {responseBody} = args;
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }
    const stripe = window.Stripe(responseBody.publicKey);
    stripe.redirectToCheckout({sessionId: responseBody.sessionId})
        .then(function (redirectResult) {
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        });
}

/**
 * Handle errors during plan click flow.
 * @param {object} args
 */
function handlePlanClickError(args) {
    const {err, el, clickHandler, errorEl} = args;
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

/**
 * Click handler for plan elements.
 * @param {object} param0
 */
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
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

    fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(function (res) {
            if (!isSuccessfulResponse(res)) {
                return null;
            }
            return res.text();
        })
        .then(function (identity) {
            return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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
        })
        .then(function (res) {
            if (!isSuccessfulResponse(res)) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        })
        .then(function (responseBody) {
            redirectToStripe({responseBody});
        })
        .catch(function (err) {
            handlePlanClickError({err, el, clickHandler, errorEl});
        });
}

/**
 * Initialize form submit handlers.
 * @param {string} siteUrl
 * @param {function} doAction
 * @param {function} captureException
 */
function initFormHandlers(siteUrl, doAction, captureException) {
    document.querySelectorAll('form[data-members-form]').forEach(function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

/**
 * Initialize plan click handlers.
 * @param {string} siteUrl
 * @param {object} site
 * @param {object} member
 */
function initPlanHandlers(siteUrl, site, member) {
    document.querySelectorAll('[data-members-plan]').forEach(function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize edit billing click handlers.
 * @param {string} siteUrl
 */
function initEditBillingHandlers(siteUrl) {
    document.querySelectorAll('[data-members-edit-billing]').forEach(function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(function (res) {
                    if (!isSuccessfulResponse(res)) {
                        return null;
                    }
                    return res.text();
                })
                .then(function (identity) {
                    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            identity,
                            successUrl,
                            cancelUrl
                        })
                    });
                })
                .then(function (res) {
                    if (!isSuccessfulResponse(res)) {
                        throw new Error(t('Could not create stripe checkout session'));
                    }
                    return res.json();
                })
                .then(function (result) {
                    const stripe = window.Stripe(result.publicKey);
                    return stripe.redirectToCheckout({sessionId: result.sessionId});
                })
                .then(function (result) {
                    if (result.error) {
                        throw new Error(t(result.error.message));
                    }
                })
                .catch(function (err) {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    if (errorEl) {
                        errorEl.innerText = err.message;
                    }
                    el.classList.add('error');
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize manage billing click handlers.
 * @param {string} siteUrl
 */
function initManageBillingHandlers(siteUrl) {
    document.querySelectorAll('[data-members-manage-billing]').forEach(function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(function (res) {
                    if (!isSuccessfulResponse(res)) {
                        return null;
                    }
                    return res.text();
                })
                .then(function (identity) {
                    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            identity,
                            returnUrl
                        })
                    });
                })
                .then(function (res) {
                    if (!isSuccessfulResponse(res)) {
                        throw new Error(t('Could not create Stripe billing portal session'));
                    }
                    return res.json();
                })
                .then(function (result) {
                    window.location.assign(result.url);
                })
                .catch(function (err) {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    if (errorEl) {
                        errorEl.innerText = err.message;
                    }
                    el.classList.add('error');
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize signout click handlers.
 * @param {string} siteUrl
 */
function initSignoutHandlers(siteUrl) {
    document.querySelectorAll('[data-members-signout]').forEach(function (el) {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
                .then(function (res) {
                    if (res.ok) {
                        window.location.replace(siteUrl);
                    } else {
                        el.addEventListener('click', clickHandler);
                        el.classList.remove('loading');
                        el.classList.add('error');
                    }
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Determine if retention offers exist.
 * @param {Array} offers
 * @returns {boolean}
 */
function hasRetentionOffers(offers) {
    return (offers || []).some(offer => offer.redemption_type === 'retention');
}

/**
 * Initialize cancel subscription click handlers.
 * @param {string} siteUrl
 * @param {Array} offers
 * @param {function} doAction
 */
function initCancelSubscriptionHandlers(siteUrl, offers, doAction) {
    const retentionAvailable = hasRetentionOffers(offers);
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (retentionAvailable) {
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

            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(function (res) {
                    if (!isSuccessfulResponse(res)) {
                        return null;
                    }
                    return res.text();
                })
                .then(function (identity) {
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            identity,
                            smart_cancel: true
                        })
                    });
                })
                .then(function (res) {
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
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize continue subscription click handlers.
 * @param {string} siteUrl
 */
function initContinueSubscriptionHandlers(siteUrl) {
    document.querySelectorAll('[data-members-continue-subscription]').forEach(function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            const subscriptionId = el.dataset.membersContinueSubscription;

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(function (res) {
                    if (!isSuccessfulResponse(res)) {
                        return null;
                    }
                    return res.text();
                })
                .then(function (identity) {
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            identity,
                            cancel_at_period_end: false
                        })
                    });
                })
                .then(function (res) {
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
                });
        }
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize data attribute handlers across the page.
 * @param {object} options
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    initFormHandlers(siteUrl, doAction, captureException);
    initPlanHandlers(siteUrl, site, member);
    initEditBillingHandlers(siteUrl);
    initManageBillingHandlers(siteUrl);
    initSignoutHandlers(siteUrl);
    initCancelSubscriptionHandlers(siteUrl, offers, doAction);
    initContinueSubscriptionHandlers(siteUrl);
}