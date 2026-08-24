/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Displays an error message in the given element if it exists
 * @param {HTMLElement|null} errorEl - Element to display error in
 * @param {string} message - Error message to display
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles error state for forms by adding error class and displaying error message
 * @param {Error} error - Error object
 * @param {HTMLElement} form - Form element
 * @param {HTMLElement} errorEl - Element to display error in
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extracts email data from form elements
 * @param {HTMLElement} form - Form element
 * @returns {{email: string|null, name: string|undefined, emailType: string|undefined, autoRedirect: string, labels: string[], newsletters: Array<{name: string}>}}
 */
function extractFormData(form, event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');

    const email = emailInput?.value || '';
    const name = (nameInput?.value || '').trim() || undefined;

    const emailType = form.dataset.membersForm || undefined;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';

    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const labels = Array.from(labelInputs).map(input => input.value);

    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    const newsletters = Array.from(newsletterInputs).map(input => ({name: input.value}));

    return {email, name, emailType, autoRedirect, labels, newsletters};
}

/**
 * Determines if OTC (One-Time Code) is requested
 * @param {string} emailType - Type of email action requested
 * @param {HTMLFormElement|null} form - Form element
 * @returns {boolean}
 */
function isOtcRequested(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

/**
 * Sets up request body for submission
 * @param {string} email - User email
 * @param {string} emailType - Type of email action
 * @param {string[]} labels - Labels to apply
 * @param {string|undefined} name - User name
 * @param {string} autoRedirect - Autoredirect setting
 * @param {boolean} wantsOTC - Whether OTC is requested
 * @param {string|null} urlHistory - URL history
 * @param {Array<{name: string}>} newsletters - Newsletters to subscribe to
 * @returns {object} Request body
 */
function createRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters) {
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
        // Check if there are only checkable newsletter inputs but none were checked
        const checkableNewsletterInputs = newsletters.filter(n => n.name.startsWith('checkable_'));
        if (checkableNewsletterInputs.length > 0 || (new Set(newsletters.map(n => n.name)).size === 0)) {
            reqBody.newsletters = [];
        }
    }

    return reqBody;
}

/**
 * Validates that the response is OK and extracts the body
 * @param {Response} res - Response object
 * @returns {Promise<string>} Text response
 */
function validateResponseAndExtractText(res) {
    if (!res.ok) {
        return null;
    }
    return res.text();
}

/**
 * Validates that the response is OK and extracts JSON
 * @param {Response} res - Response object
 * @returns {Promise<object>} JSON response
 */
function validateResponseAndExtractJson(res) {
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/**
 * Extracts OTC response body if applicable
 * @param {Response} magicLinkRes - Response from magic link API
 * @param {boolean} wantsOTC - Whether OTC is requested
 * @returns {Promise<object|undefined>} OTC response body
 */
async function extractOtcResponseBody(magicLinkRes, wantsOTC) {
    if (!wantsOTC) {
        return undefined;
    }
    try {
        return await magicLinkRes.clone().json();
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return undefined;
    }
}

/**
 * Initiates OTC sign-in flow if OTC reference is present
 * @param {string|null} otcRef - OTC reference code
 * @param {string} email - User email
 * @param {object} responseBody - Full response body
 * @param {Function} doAction - Action handler
 * @param {Function|null} captureException - Error capture function
 * @returns {Promise<void>}
 */
async function initiateOtcSignIn(otcRef, email, responseBody, doAction, captureException) {
    if (!otcRef || typeof doAction !== 'function') {
        return;
    }
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

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');
    form.classList.add('loading');

    const {email, name, emailType, autoRedirect, labels, newsletters} = extractFormData(form, event);
    const wantsOTC = isOtcRequested(emailType, form);
    const urlHistory = getUrlHistory();
    const reqBody = createRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters);

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

            const responseBody = await extractOtcResponseBody(magicLinkRes, wantsOTC);
            const otcRef = responseBody?.otc_ref;
            await initiateOtcSignIn(otcRef, email, responseBody, doAction, captureException);
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

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;
    const urlHistory = getUrlHistory();
    const metadata = member ? {checkoutType: 'upgrade'} : {};

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    })
    .then(validateResponseAndExtractText)
    .then(function (identity) {
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
        })
        .then(validateResponseAndExtractJson);
    })
    .then(function (responseBody) {
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }

        const stripe = window.Stripe(responseBody.publicKey);
        return stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        })
        .then(function (redirectResult) {
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
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
 * Extracts URL data from edit-billing element dataset
 * @param {HTMLElement} el - DOM element with data attributes
 * @returns {{successUrl: string|undefined, cancelUrl: string|undefined}}
 */
function extractEditBillingUrls(el) {
    const membersSuccess = el.dataset.membersSuccess;
    const membersCancel = el.dataset.membersCancel;
    return {
        successUrl: membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined,
        cancelUrl: membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined
    };
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

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
        const {successUrl, cancelUrl} = extractEditBillingUrls(el);

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }

            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
            .then(validateResponseAndExtractText)
            .then(function (identity) {
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
                })
                .then(validateResponseAndExtractJson);
            })
            .then(function (result) {
                const stripe = window.Stripe(result.publicKey);
                return stripe.redirectToCheckout({
                    sessionId: result.sessionId
                })
                .then(function (result) {
                    if (result.error) {
                        throw new Error(t(result.error.message));
                    }
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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
            .then(validateResponseAndExtractText)
            .then(function (identity) {
                return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        identity,
                        returnUrl
                    })
                })
                .then(validateResponseAndExtractJson);
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;

        function clickHandler(event) {
            event.preventDefault();

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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
            .then(validateResponseAndExtractText)
            .then(function (identity) {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        identity,
                        smart_cancel: true
                    })
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
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
            .then(validateResponseAndExtractText)
            .then(function (identity) {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        identity,
                        cancel_at_period_end: false
                    })
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
            });
        }
        el.addEventListener('click', clickHandler);
    });
}