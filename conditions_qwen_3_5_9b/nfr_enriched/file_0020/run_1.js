import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Displays an error message on a specific DOM element if it exists.
 * @param {HTMLElement|null} errorEl - The DOM element to display the error on.
 * @param {string} message - The error message to display.
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles form submission errors by updating UI state and displaying messages.
 * @param {Error} error - The error object that occurred.
 * @param {HTMLFormElement} form - The form element that submitted.
 * @param {HTMLElement|null} errorEl - The DOM element to display the error on.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extracts and normalizes newsletter subscription data from form inputs.
 * @param {Event} event - The submit event object.
 * @returns {Array<{name: string}>} Array of newsletter objects.
 */
function extractNewsletterData(event) {
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    return Array.from(newsletterInputs).map(input => ({name: input.value}));
}

/**
 * Determines if newsletters should be included in the request body.
 * @param {Event} event - The submit event object.
 * @param {HTMLFormElement} form - The form element.
 * @returns {Array<{name: string}>|null} Newsletter data or null if no newsletters.
 */
function determineNewsletterRequestBody(event, form) {
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    if (newsletterInputs.length > 0) {
        return extractNewsletterData(event);
    }

    // If there was only check-able newsletter inputs in the form, but none were checked, set reqBody.newsletters to an empty array
    const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];

    if (checkableNewsletterInputs.length > 0) {
        return [];
    }

    return null;
}

/**
 * Constructs the request body for the magic link API call.
 * @param {Event} event - The submit event object.
 * @param {HTMLFormElement} form - The form element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {Function} doAction - Function to handle actions.
 * @param {Function} captureException - Function to capture exceptions.
 * @returns {Promise<void>}
 */
async function executeMagicLinkRequest(event, form, siteUrl, doAction, captureException) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            integrityToken,
            // Body is constructed in the caller to maintain logic flow or passed separately
        })
    });

    form.removeEventListener('submit', submitHandler);
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
                // eslint-disable-next-line no-console
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
}

/**
 * Handles the submission of a member form.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The submit event.
 * @param {HTMLFormElement} params.form - The form element.
 * @param {HTMLElement|null} params.errorEl - The error element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Function} params.submitHandler - The original submit handler.
 * @param {Function} params.doAction - Action handler.
 * @param {Function} params.captureException - Exception capture handler.
 */
export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
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
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(input => input.value);
    const newsletters = determineNewsletterRequestBody(event, form);

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

    if (newsletters) {
        reqBody.newsletters = newsletters;
    }

    form.classList.add('loading');

    const submitHandlerClosure = () => {
        formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException});
    };

    form.addEventListener('submit', submitHandlerClosure);

    try {
        // Re-fetch integrity token and send magic link
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.removeEventListener('submit', submitHandlerClosure);
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
                    // eslint-disable-next-line no-console
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
 * Handles clicks on plan upgrade elements.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Object} params.site - Site configuration.
 * @param {Object} params.member - Current member object.
 * @param {Function} params.clickHandler - The original click handler.
 * @returns {Promise<void>}
 */
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
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

    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};

    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
        }).then(function (res) {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    }).then(function (responseBody) {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        return stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        }).then(function (redirectResult) {
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        });
    }).catch(function (err) {
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
 * Handles clicks on billing edit elements.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Object} params.site - Site configuration.
 * @param {Object} params.member - Current member object.
 * @param {Function} params.clickHandler - The original click handler.
 * @returns {Promise<void>}
 */
export function handleBillingEditClick({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
        }).then(function (res) {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    }).then(function (result) {
        let stripe = window.Stripe(result.publicKey);
        return stripe.redirectToCheckout({
            sessionId: result.sessionId
        });
    }).then(function (result) {
        if (result.error) {
            throw new Error(t(result.error.message));
        }
    }).catch(function (err) {
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
 * Handles clicks on billing manage elements.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Object} params.site - Site configuration.
 * @param {Object} params.member - Current member object.
 * @param {Function} params.clickHandler - The original click handler.
 * @returns {Promise<void>}
 */
export function handleBillingManageClick({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
        return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                returnUrl
            })
        }).then(function (res) {
            if (!res.ok) {
                throw new Error(t('Could not create Stripe billing portal session'));
            }
            return res.json();
        });
    }).then(function (result) {
        return window.location.assign(result.url);
    }).catch(function (err) {
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
 * Handles clicks on signout elements.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Function} params.clickHandler - The original click handler.
 * @returns {Promise<void>}
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
 * Checks if any retention offers are available.
 * @param {Array} offers - Array of offer objects.
 * @returns {boolean} True if retention offers exist.
 */
function hasRetentionOffers(offers) {
    return (offers || []).some(offer => offer.redemption_type === 'retention');
}

/**
 * Handles clicks on subscription cancel elements.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Object} params.site - Site configuration.
 * @param {Object} params.member - Current member object.
 * @param {Function} params.doAction - Action handler.
 * @param {Function} params.captureException - Exception capture handler.
 * @param {Array} params.offers - Array of offers.
 * @param {Function} params.clickHandler - The original click handler.
 * @returns {Promise<void>}
 */
export function handleSubscriptionCancelClick({event, el, errorEl, siteUrl, site, member, offers, doAction, captureException, clickHandler}) {
    event.preventDefault();

    const subscriptionId = el.dataset.membersCancelSubscription;
    const hasRetention = hasRetentionOffers(offers);

    if (hasRetention) {
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

    return fetch(`${siteUrl}/members/api/session`, {
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
 * Handles clicks on subscription continue elements.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Object} params.site - Site configuration.
 * @param {Object} params.member - Current member object.
 * @param {Function} params.clickHandler - The original click handler.
 * @returns {Promise<void>}
 */
export function handleSubscriptionContinueClick({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    const subscriptionId = el.dataset.membersContinueSubscription;

    if (errorEl) {
        errorEl.innerText = '';
    }

    return fetch(`${siteUrl}/members/api/session`, {
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
 * Initializes event listeners for all data-attributes based elements.
 * @param {Object} params - Configuration parameters.
 * @param {string} params.siteUrl - The site URL.
 * @param {Object} params.site - Site configuration.
 * @param {Object} params.member - Current member object.
 * @param {Array} params.offers - Array of offers.
 * @param {Function} params.doAction - Action handler.
 * @param {Function} params.captureException - Exception capture handler.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandlerClosure = () => {
            formSubmitHandler({event: event, form, errorEl, siteUrl, submitHandler: submitHandlerClosure, doAction, captureException});
        };
        form.addEventListener('submit', submitHandlerClosure);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandlerClosure = () => {
            planClickHandler({el, event: event, errorEl, member, site, siteUrl, clickHandler: clickHandlerClosure});
        };
        el.addEventListener('click', clickHandlerClosure);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? new URL(membersSuccess, window.location.href).href : undefined;
        const cancelUrl = membersCancel ? new URL(membersCancel, window.location.href).href : undefined;

        const clickHandlerClosure = () => {
            handleBillingEditClick({el, event: event, errorEl, siteUrl, site, member, clickHandler: clickHandlerClosure});
        };
        el.addEventListener('click', clickHandlerClosure);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? new URL(membersReturn, window.location.href).href : undefined;

        const clickHandlerClosure = () => {
            handleBillingManageClick({el, event: event, errorEl, siteUrl, site, member, clickHandler: clickHandlerClosure});
        };
        el.addEventListener('click', clickHandlerClosure);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        const clickHandlerClosure = () => {
            handleSignoutClick({el, event: event, siteUrl, clickHandler: clickHandlerClosure});
        };
        el.addEventListener('click', clickHandlerClosure);
    });

    const hasRetentionOffers = hasRetentionOffers(offers);

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandlerClosure = () => {
            handleSubscriptionCancelClick({el, event: event, errorEl, siteUrl, site, member, offers, doAction, captureException, clickHandler: clickHandlerClosure});
        };
        el.addEventListener('click', clickHandlerClosure);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandlerClosure = () => {
            handleSubscriptionContinueClick({el, event: event, errorEl, siteUrl, site, member, clickHandler: clickHandlerClosure});
        };
        el.addEventListener('click', clickHandlerClosure);
    });
}