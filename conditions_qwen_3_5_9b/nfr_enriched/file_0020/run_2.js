import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Displays an error message in the specified element if it exists.
 * @param {HTMLElement|null} errorEl - The DOM element to display the error in.
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
 * @param {HTMLFormElement} form - The form element that was submitted.
 * @param {HTMLElement|null} errorEl - The DOM element to display the error in.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extracts and validates form data from a DOM form element.
 * @param {Event} event - The submit event.
 * @param {HTMLFormElement} form - The form element.
 * @returns {Object} An object containing extracted form data.
 */
function extractFormData(event, form) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(input => input.value);
    const allNewsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked');
    const newsletters = Array.from(allNewsletterInputs).map(input => ({name: input.value}));

    const urlHistory = getUrlHistory();
    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: (autoRedirect === 'true'),
        ...(wantsOTC && {includeOTC: true}),
        ...(urlHistory && {urlHistory})
    };

    if (allNewsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return reqBody;
}

/**
 * Sends a magic link request to the backend.
 * @param {string} siteUrl - The base URL of the site.
 * @param {Object} reqBody - The request body containing form data.
 * @param {string} integrityToken - The integrity token for request validation.
 * @returns {Promise<Response>} The response from the magic link endpoint.
 */
async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
    return magicLinkRes;
}

/**
 * Handles the OTC (One-Time Code) flow if requested.
 * @param {Object} responseBody - The JSON response from the magic link endpoint.
 * @param {string} email - The user's email address.
 * @param {Function} doAction - The action handler function.
 * @param {Function} captureException - The error capture function.
 */
function handleOTCFlow(responseBody, email, doAction, captureException) {
    if (!responseBody?.otc_ref || typeof doAction !== 'function') {
        return;
    }

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

/**
 * Main handler for form submission events.
 * @param {Object} params - Handler parameters.
 * @param {Event} params.event - The submit event.
 * @param {HTMLFormElement} params.form - The form element.
 * @param {HTMLElement|null} params.errorEl - The error message element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Function} params.submitHandler - The original submit handler to restore.
 * @param {Function} params.doAction - The action handler function.
 * @param {Function} params.captureException - The error capture function.
 */
export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');

    const reqBody = extractFormData(event, form);
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

    form.addEventListener('submit', submitHandler);
    form.classList.remove('loading');

    if (magicLinkRes.ok) {
        form.classList.add('success');
        const wantsOTC = reqBody.emailType === 'signin' && form?.dataset?.membersOtc === 'true';
        let responseBody;

        if (wantsOTC) {
            try {
                responseBody = await magicLinkRes.clone().json();
            } catch (e) {
                responseBody = undefined;
            }
        }

        handleOTCFlow(responseBody, reqBody.email, doAction, captureException);
    } else {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        displayErrorIfElementExists(errorEl, errorMessage);
        form.classList.add('error');
    }
}

/**
 * Prepares the request body for creating a Stripe checkout session.
 * @param {string} siteUrl - The site URL.
 * @param {Object} requestData - The base request data.
 * @param {string} successUrl - The success URL for the checkout.
 * @param {string} cancelUrl - The cancel URL for the checkout.
 * @param {Object} metadata - Additional metadata for the session.
 * @returns {Object} The prepared request body.
 */
function prepareCheckoutRequest(siteUrl, requestData, successUrl, cancelUrl, metadata) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...requestData,
            successUrl,
            cancelUrl,
            metadata
        })
    }).then(function (res) {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

/**
 * Handles the plan upgrade click event.
 * @param {Object} params - Handler parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Object} params.site - The site configuration.
 * @param {Object} params.member - The current member object.
 * @param {Function} params.clickHandler - The original click handler to restore.
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

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const checkoutRes = identityRes.then(function (identity) {
        return prepareCheckoutRequest(siteUrl, requestData, checkoutSuccessUrl, checkoutCancelUrl, metadata);
    });

    checkoutRes.then(function (responseBody) {
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
 * Handles the billing update click event.
 * @param {Object} params - Handler parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message element.
 * @param {string} params.siteUrl - The site URL.
 * @param {string} params.successUrl - The success URL.
 * @param {string} params.cancelUrl - The cancel URL.
 * @param {Function} params.clickHandler - The original click handler to restore.
 */
function handleBillingUpdate({event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const updateRes = identityRes.then(function (identity) {
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
    });

    updateRes.then(function (result) {
        const stripe = window.Stripe(result.publicKey);
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
 * Handles the billing portal click event.
 * @param {Object} params - Handler parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message element.
 * @param {string} params.siteUrl - The site URL.
 * @param {string} params.returnUrl - The return URL.
 * @param {Function} params.clickHandler - The original click handler to restore.
 */
function handleBillingPortal({event, el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const portalRes = identityRes.then(function (identity) {
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
    });

    portalRes.then(function (result) {
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
 * Handles the sign out click event.
 * @param {Object} params - Handler parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {string} params.siteUrl - The site URL.
 * @param {Function} params.clickHandler - The original click handler to restore.
 */
function handleSignout({event, el, siteUrl, clickHandler}) {
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
 * Handles the subscription cancellation click event.
 * @param {Object} params - Handler parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message element.
 * @param {string} params.siteUrl - The site URL.
 * @param {string} params.subscriptionId - The subscription ID.
 * @param {boolean} params.hasRetentionOffers - Whether retention offers are available.
 * @param {Function} params.doAction - The action handler function.
 * @param {Function} params.clickHandler - The original click handler to restore.
 */
function handleSubscriptionCancel({event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler}) {
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
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const cancelRes = identityRes.then(function (identity) {
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

    cancelRes.then(function (res) {
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
 * Handles the subscription continuation click event.
 * @param {Object} params - Handler parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message element.
 * @param {string} params.siteUrl - The site URL.
 * @param {string} params.subscriptionId - The subscription ID.
 * @param {Function} params.clickHandler - The original click handler to restore.
 */
function handleSubscriptionContinue({event, el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });

    const continueRes = identityRes.then(function (identity) {
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

    continueRes.then(function (res) {
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
 * Initializes event listeners for all data attributes on the page.
 * @param {Object} params - Initialization parameters.
 * @param {string} params.siteUrl - The site URL.
 * @param {Object} params.site - The site configuration.
 * @param {Object} params.member - The current member object.
 * @param {Array} params.offers - The available offers.
 * @param {Function} params.doAction - The action handler function.
 * @param {Function} params.captureException - The error capture function.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = function (event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = function (event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? new URL(membersSuccess, window.location.href).href : undefined;
        const cancelUrl = membersCancel ? new URL(membersCancel, window.location.href).href : undefined;
        const clickHandler = function (event) {
            handleBillingUpdate({event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? new URL(membersReturn, window.location.href).href : undefined;
        const clickHandler = function (event) {
            handleBillingPortal({event, el, errorEl, siteUrl, returnUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        const clickHandler = function (event) {
            handleSignout({event, el, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;
        const clickHandler = function (event) {
            handleSubscriptionCancel({event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;
        const clickHandler = function (event) {
            handleSubscriptionContinue({event, el, errorEl, siteUrl, subscriptionId, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });
}