import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

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
 * Checks if a response is OK.
 * @param {Response} res - The response to check.
 * @returns {boolean} True if the response is OK, false otherwise.
 */
function isResponseOk(res) {
    return res.ok;
}

/**
 * Gets the text from a response.
 * @param {Response} res - The response to get the text from.
 * @returns {Promise<string>} A promise that resolves with the text from the response.
 */
function getTextFromResponse(res) {
    return res.text();
}

/**
 * Creates a Stripe checkout session.
 * @param {string} siteUrl - The site URL.
 * @param {object} requestData - The request data.
 * @param {string} identity - The identity.
 * @param {string} successUrl - The success URL.
 * @param {string} cancelUrl - The cancel URL.
 * @param {object} metadata - The metadata.
 * @returns {Promise<object>} A promise that resolves with the response body.
 */
function createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...requestData,
            identity: identity,
            successUrl: successUrl,
            cancelUrl: cancelUrl,
            metadata
        })
    }).then(function (res) {
        if (!isResponseOk(res)) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

/**
 * Handles a form submission.
 * @param {object} options - The options.
 * @param {Event} options.event - The event.
 * @param {HTMLFormElement} options.form - The form.
 * @param {HTMLElement} options.errorEl - The error element.
 * @param {string} options.siteUrl - The site URL.
 * @param {function} options.submitHandler - The submit handler.
 * @param {function} options.doAction - The do action function.
 * @param {function} options.captureException - The capture exception function.
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
    let emailInput = event.target.querySelector('input[data-members-email]');
    let nameInput = event.target.querySelector('input[data-members-name]');
    let autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    let email = emailInput?.value;
    let name = (nameInput?.value || '').trim() || undefined;
    let emailType = undefined;
    let labels = [];
    let newsletters = [];

    let labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }

    let newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
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
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
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
        // If there was only check-able newsletter inputs in the form, but none were checked, set reqBody.newsletters
        // to an empty array so that the member is not signed up to the default newsletters
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];

        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await getTextFromResponse(integrityTokenRes);

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        if (isResponseOk(magicLinkRes)) {
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
            form.classList.add('error'); // Ensure error state is set here
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Handles a plan click.
 * @param {object} options - The options.
 * @param {Event} options.event - The event.
 * @param {HTMLElement} options.el - The element.
 * @param {HTMLElement} options.errorEl - The error element.
 * @param {string} options.siteUrl - The site URL.
 * @param {object} options.site - The site.
 * @param {object} options.member - The member.
 * @param {function} options.clickHandler - The click handler.
 */
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    let plan = el.dataset.membersPlan;
    let requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    let successUrl = el.dataset.membersSuccess;
    let cancelUrl = el.dataset.membersCancel;
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

    return getSession(siteUrl)
        .then(function (identity) {
            return createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        })
        .then(function (responseBody) {
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            });
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

/**
 * Gets the session.
 * @param {string} siteUrl - The site URL.
 * @returns {Promise<string>} A promise that resolves with the session.
 */
function getSession(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    })
        .then(function (res) {
            if (!isResponseOk(res)) {
                return null;
            }
            return getTextFromResponse(res);
        });
}

/**
 * Handles data attributes.
 * @param {object} options - The options.
 * @param {string} options.siteUrl - The site URL.
 * @param {object} options.site - The site.
 * @param {object} options.member - The member.
 * @param {array} options.offers - The offers.
 * @param {function} options.doAction - The do action function.
 * @param {function} options.captureException - The capture exception function.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        let errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        let membersSuccess = el.dataset.membersSuccess;
        let membersCancel = el.dataset.membersCancel;
        let successUrl;
        let cancelUrl;

        if (membersSuccess) {
            successUrl = (new URL(membersSuccess, window.location.href)).href;
        }

        if (membersCancel) {
            cancelUrl = (new URL(membersCancel, window.location.href)).href;
        }

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            getSession(siteUrl)
                .then(function (identity) {
                    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            identity: identity,
                            successUrl: successUrl,
                            cancelUrl: cancelUrl
                        })
                    });
                })
                .then(function (res) {
                    if (!isResponseOk(res)) {
                        throw new Error(t('Could not create stripe checkout session'));
                    }
                    return res.json();
                })
                .then(function (result) {
                    let stripe = window.Stripe(result.publicKey);
                    return stripe.redirectToCheckout({
                        sessionId: result.sessionId
                    });
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        let membersReturn = el.dataset.membersReturn;
        let returnUrl;

        if (membersReturn) {
            returnUrl = (new URL(membersReturn, window.location.href)).href;
        }

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            getSession(siteUrl)
                .then(function (identity) {
                    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            identity: identity,
                            returnUrl
                        })
                    });
                })
                .then(function (res) {
                    if (!isResponseOk(res)) {
                        throw new Error(t('Could not create Stripe billing portal session'));
                    }
                    return res.json();
                })
                .then(function (result) {
                    return window.location.assign(result.url);
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, {
                method: 'DELETE'
            })
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

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            event.preventDefault();

            let subscriptionId = el.dataset.membersCancelSubscription;

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

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            getSession(siteUrl)
                .then(function (identity) {
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            identity: identity,
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            let subscriptionId = el.dataset.membersContinueSubscription;

            if (errorEl) {
                errorEl.innerText = '';
            }

            getSession(siteUrl)
                .then(function (identity) {
                    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            identity: identity,
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