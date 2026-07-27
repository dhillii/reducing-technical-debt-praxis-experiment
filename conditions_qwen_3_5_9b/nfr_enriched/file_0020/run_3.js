import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Displays an error message in the specified element if it exists.
 * @param {HTMLElement} errorEl - The error element to update.
 * @param {string} message - The error message to display.
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles form submission errors by updating UI state and displaying messages.
 * @param {Error} error - The error object.
 * @param {HTMLElement} form - The form element.
 * @param {HTMLElement} errorEl - The error message element.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extracts and validates form data for member submission.
 * @param {Event} event - The submit event.
 * @param {HTMLElement} form - The form element.
 * @param {HTMLElement} errorEl - The error message element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {Function} submitHandler - The original submit handler to restore.
 * @param {Function} doAction - Action dispatcher.
 * @param {Function} captureException - Exception capture handler.
 * @returns {Object} The prepared request body.
 */
function prepareFormRequestBody(event, form, errorEl, siteUrl, submitHandler, doAction, captureException) {
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
    let labels = [];
    let newsletters = [];

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
    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return reqBody;
}

/**
 * Executes the form submission logic after data preparation.
 * @param {Event} event - The submit event.
 * @param {HTMLElement} form - The form element.
 * @param {HTMLElement} errorEl - The error message element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {Function} submitHandler - The original submit handler to restore.
 * @param {Function} doAction - Action dispatcher.
 * @param {Function} captureException - Exception capture handler.
 * @param {Object} reqBody - The prepared request body.
 */
function executeFormSubmission(event, form, errorEl, siteUrl, submitHandler, doAction, captureException, reqBody) {
    form.classList.add('loading');
    const integrityTokenRes = fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = integrityTokenRes.then(res => res.text());

    const magicLinkRes = fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });

    form.addEventListener('submit', submitHandler);
    form.classList.remove('loading');

    return magicLinkRes.then(res => {
        if (res.ok) {
            form.classList.add('success');

            let responseBody;
            const wantsOTC = reqBody.emailType === 'signin' && form?.dataset?.membersOtc === 'true';
            if (wantsOTC) {
                try {
                    responseBody = res.clone().json();
                } catch (e) {
                    responseBody = undefined;
                }
            }

            const otcRef = responseBody?.otc_ref;
            if (otcRef && typeof doAction === 'function') {
                try {
                    doAction('startSigninOTCFromCustomForm', {
                        email: (reqBody.email || '').trim(),
                        otcRef,
                        inboxLinks: responseBody?.inboxLinks
                    });
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error(e);
                    captureException?.(e);
                }
            }
        } else {
            const e = HumanReadableError.fromApiResponse(res);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
        }
    }).catch(err => {
        handleError(err, form, errorEl);
    });
}

/**
 * Handles plan click events to initiate checkout sessions.
 * @param {Event} event - The click event.
 * @param {HTMLElement} el - The clicked element.
 * @param {HTMLElement} errorEl - The error message element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {Object} site - Site configuration.
 * @param {Object} member - Current member object.
 * @param {Function} clickHandler - The original click handler to restore.
 */
function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    let checkoutSuccessUrl;
    let checkoutCancelUrl;

    if (successUrl) {
        checkoutSuccessUrl = (new URL(successUrl, window.location.href)).href;
    }

    if (cancelUrl) {
        checkoutCancelUrl = (new URL(cancelUrl, window.location.href)).href;
    }

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const sessionRes = identityRes.then(identity => {
        return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...requestData,
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl,
                metadata
            })
        }).then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    });

    return sessionRes.then(responseBody => {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        return stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        }).then(redirectResult => {
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        });
    }).catch(err => {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    });
}

/**
 * Handles billing edit click events to initiate update sessions.
 * @param {Event} event - The click event.
 * @param {HTMLElement} el - The clicked element.
 * @param {HTMLElement} errorEl - The error message element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {string} successUrl - The success URL for the session.
 * @param {string} cancelUrl - The cancel URL for the session.
 * @param {Function} clickHandler - The original click handler to restore.
 */
function handleBillingEditClick(event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const sessionRes = identityRes.then(identity => {
        return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                successUrl,
                cancelUrl
            })
        }).then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    });

    return sessionRes.then(result => {
        const stripe = window.Stripe(result.publicKey);
        return stripe.redirectToCheckout({
            sessionId: result.sessionId
        });
    }).then(result => {
        if (result.error) {
            throw new Error(t(result.error.message));
        }
    }).catch(err => {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    });
}

/**
 * Handles billing manage click events to initiate portal sessions.
 * @param {Event} event - The click event.
 * @param {HTMLElement} el - The clicked element.
 * @param {HTMLElement} errorEl - The error message element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {string} returnUrl - The return URL for the session.
 * @param {Function} clickHandler - The original click handler to restore.
 */
function handleBillingManageClick(event, el, errorEl, siteUrl, returnUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const sessionRes = identityRes.then(identity => {
        return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                returnUrl
            })
        }).then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create Stripe billing portal session'));
            }
            return res.json();
        });
    });

    return sessionRes.then(result => {
        return window.location.assign(result.url);
    }).catch(err => {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    });
}

/**
 * Handles signout click events.
 * @param {Event} event - The click event.
 * @param {HTMLElement} el - The clicked element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {Function} clickHandler - The original click handler to restore.
 */
function handleSignoutClick(event, el, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    fetch(`${siteUrl}/members/api/session`, {
        method: 'DELETE'
    }).then(res => {
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
 * Handles subscription cancellation click events.
 * @param {Event} event - The click event.
 * @param {HTMLElement} el - The clicked element.
 * @param {HTMLElement} errorEl - The error message element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {string} subscriptionId - The subscription ID to cancel.
 * @param {boolean} hasRetentionOffers - Whether retention offers are available.
 * @param {Function} doAction - Action dispatcher.
 * @param {Function} clickHandler - The original click handler to restore.
 */
function handleCancelSubscriptionClick(event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler) {
    event.preventDefault();

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

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const sessionRes = identityRes.then(identity => {
        return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                smart_cancel: true
            })
        });
    });

    return sessionRes.then(res => {
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

/**
 * Handles subscription continuation click events.
 * @param {Event} event - The click event.
 * @param {HTMLElement} el - The clicked element.
 * @param {HTMLElement} errorEl - The error message element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {string} subscriptionId - The subscription ID to continue.
 * @param {Function} clickHandler - The original click handler to restore.
 */
function handleContinueSubscriptionClick(event, el, errorEl, siteUrl, subscriptionId, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const sessionRes = identityRes.then(identity => {
        return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                cancel_at_period_end: false
            })
        });
    });

    return sessionRes.then(res => {
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

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    const reqBody = prepareFormRequestBody(event, form, errorEl, siteUrl, submitHandler, doAction, captureException);
    await executeFormSubmission(event, form, errorEl, siteUrl, submitHandler, doAction, captureException, reqBody);
}

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

        if (membersSuccess) {
            successUrl = (new URL(membersSuccess, window.location.href)).href;
        }

        if (membersCancel) {
            cancelUrl = (new URL(membersCancel, window.location.href)).href;
        }

        function clickHandler(event) {
            handleBillingEditClick(event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        let returnUrl;

        if (membersReturn) {
            returnUrl = (new URL(membersReturn, window.location.href)).href;
        }

        function clickHandler(event) {
            handleBillingManageClick(event, el, errorEl, siteUrl, returnUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(event, el, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;

        function clickHandler(event) {
            handleCancelSubscriptionClick(event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;

        function clickHandler(event) {
            handleContinueSubscriptionClick(event, el, errorEl, siteUrl, subscriptionId, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}