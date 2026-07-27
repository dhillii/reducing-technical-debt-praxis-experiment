import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Displays an error message in the specified element if it exists.
 * @param {HTMLElement} errorEl - The DOM element to display the error in.
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
 * @param {HTMLElement} errorEl - The error message container element.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extracts and validates newsletter subscription preferences from form inputs.
 * @param {EventTarget} form - The form element.
 * @returns {Array} Array of newsletter objects with 'name' property.
 */
function extractNewsletterPreferences(form) {
    const newsletterInputs = form.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    );

    return Array.from(newsletterInputs).map(input => ({
        name: input.value
    }));
}

/**
 * Prepares the request body for sending a magic link email.
 * @param {Event} event - The submit event.
 * @param {HTMLElement} form - The form element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {Function} doAction - Function to handle actions.
 * @param {Function} captureException - Function to capture exceptions.
 * @returns {Promise} Promise that resolves to the fetch response.
 */
async function sendMagicLinkEmail({event, form, siteUrl, doAction, captureException}) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = Array.from(
        event.target.querySelectorAll('input[data-members-label]')
    ).map(input => input.value);

    const newsletters = extractNewsletterPreferences(event.target);

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

    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll(
            'input[type=checkbox][data-members-newsletter]'
        );

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

        form.classList.remove('loading');
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
    } catch (err) {
        handleError(err, form, null);
    }
}

/**
 * Handles plan upgrade clicks by initiating a Stripe checkout session.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {Object} params.site - Site configuration object.
 * @param {Object} params.member - Current member object.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise} Promise that resolves when checkout is complete or rejected.
 */
export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;

    const checkoutSuccessUrl = successUrl ? new URL(successUrl, window.location.href).href : undefined;
    const checkoutCancelUrl = cancelUrl ? new URL(cancelUrl, window.location.href).href : undefined;

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

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!identityRes.ok) {
            throw new Error('Failed to get session identity');
        }

        const identity = await identityRes.text();

        const checkoutRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase()),
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl,
                metadata
            })
        });

        if (!checkoutRes.ok) {
            const error = await HumanReadableError.fromApiResponse(checkoutRes);
            const errorMessage = chooseBestErrorMessage(error, t('Could not create stripe checkout session'));
            displayErrorIfElementExists(errorEl, errorMessage);
            el.classList.add('error');
            throw error;
        }

        const responseBody = await checkoutRes.json();

        if (responseBody.url) {
            window.location.assign(responseBody.url);
            return;
        }

        const stripe = window.Stripe(responseBody.publicKey);
        await stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        });
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
 * Handles billing edit clicks by initiating a Stripe update session.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {string} params.successUrl - The success URL for the checkout.
 * @param {string} params.cancelUrl - The cancel URL for the checkout.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise} Promise that resolves when checkout is complete or rejected.
 */
export async function handleBillingEditClick({event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!identityRes.ok) {
            throw new Error('Failed to get session identity');
        }

        const identity = await identityRes.text();

        const checkoutRes = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                successUrl: successUrl ? new URL(successUrl, window.location.href).href : undefined,
                cancelUrl: cancelUrl ? new URL(cancelUrl, window.location.href).href : undefined
            })
        });

        if (!checkoutRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const result = await checkoutRes.json();
        const stripe = window.Stripe(result.publicKey);
        await stripe.redirectToCheckout({
            sessionId: result.sessionId
        });
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
 * Handles billing management clicks by initiating a Stripe billing portal session.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {string} params.returnUrl - The return URL for the portal.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise} Promise that resolves when portal is opened or rejected.
 */
export async function handleBillingManageClick({event, el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!identityRes.ok) {
            throw new Error('Failed to get session identity');
        }

        const identity = await identityRes.text();

        const portalRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                returnUrl: returnUrl ? new URL(returnUrl, window.location.href).href : undefined
            })
        });

        if (!portalRes.ok) {
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

/**
 * Handles signout clicks by terminating the current session.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {Function} params.clickHandler - Original click handler to restore.
 */
export function handleSignoutClick({event, el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    fetch(`${siteUrl}/members/api/session`, {
        method: 'DELETE'
    }).then(function (res) {
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
 * Handles subscription cancellation clicks.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {string} params.subscriptionId - The ID of the subscription to cancel.
 * @param {boolean} params.hasRetentionOffers - Whether retention offers are available.
 * @param {Function} params.doAction - Function to handle actions.
 * @param {Function} params.clickHandler - Original click handler to restore.
 */
export function handleSubscriptionCancelClick({event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler}) {
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

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
    }).then(function (res) {
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
 * Handles subscription continuation clicks.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {string} params.subscriptionId - The ID of the subscription to continue.
 * @param {Function} params.clickHandler - Original click handler to restore.
 */
export function handleSubscriptionContinueClick({event, el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
    }).then(function (res) {
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

/**
 * Initializes event listeners for all member-related data attributes.
 * @param {Object} params - Configuration parameters.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {Object} params.site - Site configuration object.
 * @param {Object} params.member - Current member object.
 * @param {Array} params.offers - Array of offer objects.
 * @param {Function} params.doAction - Function to handle actions.
 * @param {Function} params.captureException - Function to capture exceptions.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        form.addEventListener('submit', function (event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler: null, doAction, captureException});
        });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        el.addEventListener('click', function (event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler: null});
        });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? new URL(membersSuccess, window.location.href).href : undefined;
        const cancelUrl = membersCancel ? new URL(membersCancel, window.location.href).href : undefined;

        el.addEventListener('click', function (event) {
            handleBillingEditClick({event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler: null});
        });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? new URL(membersReturn, window.location.href).href : undefined;

        el.addEventListener('click', function (event) {
            handleBillingManageClick({event, el, errorEl, siteUrl, returnUrl, clickHandler: null});
        });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        el.addEventListener('click', function (event) {
            handleSignoutClick({event, el, siteUrl, clickHandler: null});
        });
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;

        el.addEventListener('click', function (event) {
            handleSubscriptionCancelClick({event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler: null});
        });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;

        el.addEventListener('click', function (event) {
            handleSubscriptionContinueClick({event, el, errorEl, siteUrl, subscriptionId, clickHandler: null});
        });
    });
}

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');

    try {
        await sendMagicLinkEmail({event, form, siteUrl, doAction, captureException});
    } catch (err) {
        // sendMagicLinkEmail handles its own error display, but we catch here to prevent unhandled promise rejections
        // if doAction or captureException throws unexpectedly.
        console.error(err);
    } finally {
        form.addEventListener('submit', submitHandler);
    }
}