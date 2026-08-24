/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Displays error message on a given DOM element if it exists.
 * @param {HTMLElement | null} errorEl - The DOM element to display the error in.
 * @param {string} message - The error message to display.
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Adds error state to form and displays error message.
 * @param {Error} error - The error object.
 * @param {HTMLElement} form - The form element.
 * @param {HTMLElement | null} errorEl - The element to display the error in.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extracts newsletter inputs from the form and returns an array of newsletter objects.
 * @param {HTMLElement} formElement - The form DOM element.
 * @returns {Array<{name: string}>}
 */
function extractNewsletters(formElement) {
    const newsletterInputs = formElement.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    );

    return Array.from(newsletterInputs).map(input => ({name: input.value}));
}

/**
 * Extracts label values from label inputs in the form.
 * @param {HTMLElement} formElement - The form DOM element.
 * @returns {Array<string>}
 */
function extractLabels(formElement) {
    const labelInputs = formElement.querySelectorAll('input[data-members-label]');
    return Array.from(labelInputs).map(input => input.value);
}

/**
 * Builds and returns the request body object for API calls.
 * @param {HTMLElement} formElement - The form DOM element.
 * @param {string} emailType - The type of email action.
 * @param {boolean} wantsOTC - Whether one-time code is requested.
 * @param {boolean} autoRedirect - Whether autoredirect is enabled.
 * @param {object} urlHistory - Optional history URL.
 * @returns {object}
 */
function buildRequestPayload(formElement, emailType, wantsOTC, autoRedirect, urlHistory) {
    const emailInput = formElement.querySelector('input[data-members-email]');
    const nameInput = formElement.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;

    const newsletters = extractNewsletters(formElement);
    const labels = extractLabels(formElement);

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

    // Handle zero-checked newsletters explicitly
    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else if (formElement.querySelectorAll('input[type=checkbox][data-members-newsletter]').length > 0) {
        reqBody.newsletters = [];
    }

    return reqBody;
}

/**
 * Main submission handler for members forms.
 * @param {object} options - Handler options.
 * @param {Event} options.event - The submit event.
 * @param {HTMLElement} options.form - The form element.
 * @param {HTMLElement | null} options.errorEl - Error display element.
 * @param {string} options.siteUrl - Base site URL.
 * @param {Function} options.submitHandler - The original submit event handler.
 * @param {Function} [options.doAction] - Optional Ghost action dispatcher.
 * @param {Function} [options.captureException] - Optional exception capturer.
 * @returns {void}
 */
export async function formSubmitHandler({
    event, form, errorEl, siteUrl, submitHandler, doAction, captureException
}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');

    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestPayload(form, emailType, wantsOTC, autoRedirect, urlHistory);

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
            form.classList.add('success');

            if (wantsOTC) {
                let responseBody;
                try {
                    responseBody = await magicLinkRes.clone().json();
                } catch (e) {
                    responseBody = undefined;
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
                        console.error(e);
                        captureException?.(e);
                    }
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
 * Extracts checkout URLs from dataset attributes.
 * @param {string | undefined} successUrl - Success URL from dataset.
 * @param {string | undefined} cancelUrl - Cancel URL from dataset.
 * @returns {object} Object with 'checkoutSuccessUrl' and 'checkoutCancelUrl' keys.
 */
function extractCheckoutUrls(successUrl, cancelUrl) {
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;
    return {checkoutSuccessUrl, checkoutCancelUrl};
}

/**
 * Handles plan click to initiate Stripe checkout.
 * @param {object} options - Handler options.
 * @param {Event} options.event - The click event.
 * @param {HTMLElement} options.el - The clicked element.
 * @param {HTMLElement | null} options.errorEl - Error display element.
 * @param {string} options.siteUrl - Base site URL.
 * @param {object} options.site - Site metadata.
 * @param {object} options.member - Current member (if any).
 * @param {Function} options.clickHandler - Original click handler.
 * @returns {Promise<void>}
 */
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan?.toLowerCase());
    const {checkoutSuccessUrl, checkoutCancelUrl} = extractCheckoutUrls(
        el.dataset.membersSuccess, el.dataset.membersCancel
    );

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');
    const urlHistory = getUrlHistory();
    const metadata = member ? {checkoutType: 'upgrade'} : {};

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => res.ok ? res.text() : null)
        .then(identity => {
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
        .then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        })
        .then(responseBody => {
            if (responseBody.url) {
                window.location.assign(responseBody.url);
                return;
            }

            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({sessionId: responseBody.sessionId})
                .catch(err => {
                    throw new Error(err?.message || t('Redirect failed'));
                });
        })
        .catch(err => {
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
 * Handles billing update button click to open Stripe billing update session.
 * @param {HTMLElement} el - The clicked element.
 * @param {string} siteUrl - Base site URL.
 * @param {HTMLElement | null} errorEl - Error display element.
 * @param {string | undefined} successUrl - Success URL from dataset.
 * @param {string | undefined} cancelUrl - Cancel URL from dataset.
 * @returns {Promise<void>}
 */
async function handleEditBillingClick(el, siteUrl, errorEl, successUrl, cancelUrl) {
    const {checkoutSuccessUrl, checkoutCancelUrl} = extractCheckoutUrls(successUrl, cancelUrl);

    el.removeEventListener('click', handleEditBillingClick);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
            .then(res => res.ok ? res.text() : null);

        if (!identity) {
            throw new Error(t('Unable to retrieve session identity'));
        }

        const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl
            })
        });

        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const result = await res.json();
        const stripe = window.Stripe(result.publicKey);
        await stripe.redirectToCheckout({sessionId: result.sessionId});
    } catch (err) {
        console.error(err);
        el.addEventListener('click', handleEditBillingClick);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

/**
 * Handles billing management link click to redirect to Stripe billing portal.
 * @param {HTMLElement} el - The clicked element.
 * @param {string} siteUrl - Base site URL.
 * @param {HTMLElement | null} errorEl - Error display element.
 * @param {string | undefined} returnUrl - Return URL from dataset.
 * @returns {Promise<void>}
 */
async function handleManageBillingClick(el, siteUrl, errorEl, returnUrl) {
    el.removeEventListener('click', handleManageBillingClick);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
            .then(res => res.ok ? res.text() : null);

        if (!identity) {
            throw new Error(t('Unable to retrieve session identity'));
        }

        const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                returnUrl
            })
        });

        if (!res.ok) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }

        const result = await res.json();
        window.location.assign(result.url);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', handleManageBillingClick);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

/**
 * Handles subscription cancellation request.
 * @param {HTMLElement} el - The clicked element.
 * @param {string} siteUrl - Base site URL.
 * @param {string} subscriptionId - Subscription ID to cancel.
 * @param {HTMLElement | null} errorEl - Error display element.
 * @param {boolean} hasRetentionOffers - Whether retention offer is available.
 * @param {Function} doAction - Ghost action dispatcher.
 * @returns {Promise<void>}
 */
async function handleCancelSubscriptionClick(el, siteUrl, subscriptionId, errorEl, hasRetentionOffers, doAction) {
    // If retention offer is available, open Portal to show the offer
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

    el.removeEventListener('click', handleCancelSubscriptionClick);
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identity = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
            .then(res => res.ok ? res.text() : null);

        if (!identity) {
            throw new Error(t('Unable to retrieve session identity'));
        }

        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, smart_cancel: true})
        });

        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', handleCancelSubscriptionClick);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) {
                errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        // Fallback for unexpected errors ? per requirement only only catch in existing handler
    }
}

/**
 * Handles resuming a paused/cancelled subscription.
 * @param {HTMLElement} el - The clicked element.
 * @param {string} siteUrl - Base site URL.
 * @param {string} subscriptionId - Subscription ID to resume.
 * @param {HTMLElement | null} errorEl - Error display element.
 * @returns {Promise<void>}
 */
async function handleContinueSubscriptionClick(el, siteUrl, subscriptionId, errorEl) {
    el.removeEventListener('click', handleContinueSubscriptionClick);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identity = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
            .then(res => res.ok ? res.text() : null);

        if (!identity) {
            throw new Error(t('Unable to retrieve session identity'));
        }

        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, cancel_at_period_end: false})
        });

        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', handleContinueSubscriptionClick);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) {
                errorEl.innerText = t('There was an error continuing your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
    }
}

/**
 * Main handler that binds all data-attribute-driven behavior.
 * Registers event listeners on elements with data-members-* attributes.
 * @param {object} options - Configuration options.
 * @param {string} options.siteUrl - Base site URL.
 * @param {object} [options.site] - Site metadata.
 * @param {object} [options.member] - Current member object.
 * @param {Array} [options.offers] - Member offers list.
 * @param {Function} [options.doAction] - Ghost action dispatcher.
 * @param {Function} [options.captureException] - Optional exception capturer.
 * @returns {void}
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // Bind form submit handlers
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException});
        form.addEventListener('submit', submitHandler);
    });

    // Bind plan click handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
        el.addEventListener('click', clickHandler);
    });

    // Bind edit billing click handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess;
        const cancelUrl = el.dataset.membersCancel;

        const clickHandler = event => handleEditBillingClick(el, siteUrl, errorEl, successUrl, cancelUrl);
        el.addEventListener('click', clickHandler);
    });

    // Bind manage billing click handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn;

        const clickHandler = event => handleManageBillingClick(el, siteUrl, errorEl, returnUrl);
        el.addEventListener('click', clickHandler);
    });

    // Bind signout click handler
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        const clickHandler = async function (event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
                .then(res => {
                    if (res.ok) {
                        window.location.replace(siteUrl);
                    } else {
                        el.addEventListener('click', clickHandler);
                        el.classList.remove('loading');
                        el.classList.add('error');
                    }
                });
        };

        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Bind cancel subscription handler
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const parent = el.parentElement;
        const errorEl = parent.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;

        const clickHandler = event => handleCancelSubscriptionClick(el, siteUrl, subscriptionId, errorEl, hasRetentionOffers, doAction);
        el.addEventListener('click', clickHandler);
    });

    // Bind continue subscription handler
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const parent = el.parentElement;
        const errorEl = parent.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;

        const clickHandler = event => handleContinueSubscriptionClick(el, siteUrl, subscriptionId, errorEl);
        el.addEventListener('click', clickHandler);
    });
}