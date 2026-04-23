```javascript
/* eslint-disable no-console */
import { getCheckoutSessionDataFromPlanAttribute, getUrlHistory } from './utils/helpers';
import { HumanReadableError, chooseBestErrorMessage } from './utils/errors';
import { t } from './utils/i18n';

/**
 * Displays an error message if the error element exists.
 * @param {HTMLElement} errorEl - The error element.
 * @param {string} message - The error message.
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles an error by displaying an error message and adding an error class to the form.
 * @param {Error} error - The error to handle.
 * @param {HTMLFormElement} form - The form to add an error class to.
 * @param {HTMLElement} errorEl - The error element to display the error message in.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Gets the email input value from the form.
 * @param {HTMLFormElement} form - The form to get the email input value from.
 * @returns {string} The email input value.
 */
function getEmailInputValue(form) {
    const emailInput = form.querySelector('input[data-members-email]');
    return emailInput?.value;
}

/**
 * Gets the name input value from the form.
 * @param {HTMLFormElement} form - The form to get the name input value from.
 * @returns {string} The name input value.
 */
function getNameInputValue(form) {
    const nameInput = form.querySelector('input[data-members-name]');
    return (nameInput?.value || '').trim() || undefined;
}

/**
 * Gets the labels from the form.
 * @param {HTMLFormElement} form - The form to get the labels from.
 * @returns {string[]} The labels.
 */
function getLabels(form) {
    const labelInputs = form.querySelectorAll('input[data-members-label]');
    return Array.prototype.map.call(labelInputs, (labelInput) => labelInput.value);
}

/**
 * Gets the newsletters from the form.
 * @param {HTMLFormElement} form - The form to get the newsletters from.
 * @returns {object[]} The newsletters.
 */
function getNewsletters(form) {
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked');
    return Array.prototype.map.call(newsletterInputs, (newsletterInput) => ({ name: newsletterInput.value }));
}

/**
 * Gets the request body for the magic link API call.
 * @param {string} email - The email to include in the request body.
 * @param {string} emailType - The email type to include in the request body.
 * @param {string[]} labels - The labels to include in the request body.
 * @param {string} name - The name to include in the request body.
 * @param {boolean} autoRedirect - Whether to auto redirect.
 * @param {object[]} newsletters - The newsletters to include in the request body.
 * @param {string} urlHistory - The URL history to include in the request body.
 * @returns {object} The request body.
 */
function getMagicLinkRequestBody(email, emailType, labels, name, autoRedirect, newsletters, urlHistory) {
    const requestBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: autoRedirect,
    };

    if (newsletters.length > 0) {
        requestBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = document.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            requestBody.newsletters = [];
        }
    }

    if (urlHistory) {
        requestBody.urlHistory = urlHistory;
    }

    return requestBody;
}

/**
 * Handles the form submission.
 * @param {object} options - The options for the form submission handler.
 * @param {Event} options.event - The event that triggered the form submission.
 * @param {HTMLFormElement} options.form - The form that was submitted.
 * @param {HTMLElement} options.errorEl - The error element to display error messages in.
 * @param {string} options.siteUrl - The site URL.
 * @param {function} options.submitHandler - The submit handler to remove and re-add.
 * @param {function} options.doAction - The doAction function to call.
 * @param {function} options.captureException - The captureException function to call.
 */
export async function formSubmitHandler({
    event,
    form,
    errorEl,
    siteUrl,
    submitHandler,
    doAction,
    captureException,
}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');
    const email = getEmailInputValue(form);
    const name = getNameInputValue(form);
    const labels = getLabels(form);
    const newsletters = getNewsletters(form);
    const emailType = form.dataset.membersForm;
    const autoRedirect = form.dataset.membersAutoredirect === 'true';
    const wantsOTC = emailType === 'signin' && form.dataset.membersOtc === 'true';

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const requestBody = getMagicLinkRequestBody(email, emailType, labels, name, autoRedirect, newsletters, urlHistory);

    if (wantsOTC) {
        requestBody.includeOTC = true;
    }

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, { method: 'GET' });
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestBody, integrityToken }),
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
                        inboxLinks: responseBody?.inboxLinks,
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
            form.classList.add('error'); // Ensure error state is set here
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Handles the plan click.
 * @param {object} options - The options for the plan click handler.
 * @param {Event} options.event - The event that triggered the plan click.
 * @param {HTMLElement} options.el - The element that was clicked.
 * @param {HTMLElement} options.errorEl - The error element to display error messages in.
 * @param {string} options.siteUrl - The site URL.
 * @param {object} options.site - The site object.
 * @param {object} options.member - The member object.
 * @param {function} options.clickHandler - The click handler to remove and re-add.
 */
export function planClickHandler({
    event,
    el,
    errorEl,
    siteUrl,
    site,
    member,
    clickHandler,
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
    const metadata = member ? { checkoutType: 'upgrade' } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
        .then((res) => {
            if (!res.ok) {
                return null;
            }
            return res.text();
        })
        .then((identity) => {
            return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...requestData,
                    identity: identity,
                    successUrl: checkoutSuccessUrl,
                    cancelUrl: checkoutCancelUrl,
                    metadata,
                }),
            });
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        })
        .then((responseBody) => {
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({ sessionId: responseBody.sessionId });
        })
        .catch((err) => {
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
 * Handles the data attributes.
 * @param {object} options - The options for the data attributes handler.
 * @param {string} options.siteUrl - The site URL.
 * @param {object} options.site - The site object.
 * @param {object} options.member - The member object.
 * @param {object[]} options.offers - The offers array.
 * @param {function} options.doAction - The doAction function to call.
 * @param {function} options.captureException - The captureException function to call.
 */
export function handleDataAttributes({
    siteUrl,
    site = {},
    member,
    offers = [],
    doAction,
    captureException,
} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // Handle form submissions
    document.querySelectorAll('form[data-members-form]').forEach((form) => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = (event) => {
            formSubmitHandler({ event, errorEl, form, siteUrl, submitHandler, doAction, captureException });
        };
        form.addEventListener('submit', submitHandler);
    });

    // Handle plan clicks
    document.querySelectorAll('[data-members-plan]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = (event) => {
            planClickHandler({ el, event, errorEl, member, site, siteUrl, clickHandler });
        };
        el.addEventListener('click', clickHandler);
    });

    // Handle edit billing clicks
    document.querySelectorAll('[data-members-edit-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? new URL(membersSuccess, window.location.href).href : undefined;
        const cancelUrl = membersCancel ? new URL(membersCancel, window.location.href).href : undefined;

        const clickHandler = (event) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
                .then((res) => {
                    if (!res.ok) {
                        return null;
                    }
                    return res.text();
                })
                .then((identity) => {
                    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            identity: identity,
                            successUrl: successUrl,
                            cancelUrl: cancelUrl,
                        }),
                    });
                })
                .then((res) => {
                    if (!res.ok) {
                        throw new Error(t('Could not create stripe checkout session'));
                    }
                    return res.json();
                })
                .then((result) => {
                    const stripe = window.Stripe(result.publicKey);
                    return stripe.redirectToCheckout({ sessionId: result.sessionId });
                })
                .catch((err) => {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    if (errorEl) {
                        errorEl.innerText = err.message;
                    }
                    el.classList.add('error');
                });
        };
        el.addEventListener('click', clickHandler);
    });

    // Handle manage billing clicks
    document.querySelectorAll('[data-members-manage-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? new URL(membersReturn, window.location.href).href : undefined;

        const clickHandler = (event) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
                .then((res) => {
                    if (!res.ok) {
                        return null;
                    }
                    return res.text();
                })
                .then((identity) => {
                    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            identity: identity,
                            returnUrl,
                        }),
                    });
                })
                .then((res) => {
                    if (!res.ok) {
                        throw new Error(t('Could not create Stripe billing portal session'));
                    }
                    return res.json();
                })
                .then((result) => {
                    return window.location.assign(result.url);
                })
                .catch((err) => {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    if (errorEl) {
                        errorEl.innerText = err.message;
                    }
                    el.classList.add('error');
                });
        };
        el.addEventListener('click', clickHandler);
    });

    // Handle sign out clicks
    document.querySelectorAll('[data-members-signout]').forEach((el) => {
        const clickHandler = (event) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, { method: 'DELETE' })
                .then((res) => {
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

    // Handle cancel subscription clicks
    const hasRetentionOffers = (offers || []).some((offer) => offer.redemption_type === 'retention');
    document.querySelectorAll('[data-members-cancel-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = (event) => {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction('openPopup', {
                    page: 'accountPlan',
                    pageData: {
                        subscriptionId,
                        action: 'cancel',
                    },
                });

                return;
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            return fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
                .then((res) => {
                    if (!res.ok) {
                        return null;
                    }

                    return res.text();
                })
                .then((identity) => {
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            identity: identity,
                            smart_cancel: true,
                        }),
                    });
                })
                .then((res) => {
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
        };
        el.addEventListener('click', clickHandler);
    });

    // Handle continue subscription clicks
    document.querySelectorAll('[data-members-continue-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = (event) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            const subscriptionId = el.dataset.membersContinueSubscription;

            if (errorEl) {
                errorEl.innerText = '';
            }

            return fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
                .then((res) => {
                    if (!res.ok) {
                        return null;
                    }

                    return res.text();
                })
                .then((identity) => {
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            identity: identity,
                            cancel_at_period_end: false,
                        }),
                    });
                })
                .then((res) => {
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
        };
        el.addEventListener('click', clickHandler);
    });
}
```