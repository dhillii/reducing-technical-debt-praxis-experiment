```javascript
/* eslint-disable no-console */
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
 * @param {Error} error - The error.
 * @param {HTMLElement} form - The form.
 * @param {HTMLElement} errorEl - The error element.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Checks if the email input is valid.
 * @param {HTMLInputElement} emailInput - The email input.
 * @returns {boolean} True if the email input is valid, false otherwise.
 */
function isValidEmailInput(emailInput) {
    return emailInput && emailInput.value;
}

/**
 * Checks if the name input is valid.
 * @param {HTMLInputElement} nameInput - The name input.
 * @returns {boolean} True if the name input is valid, false otherwise.
 */
function isValidNameInput(nameInput) {
    return nameInput && nameInput.value.trim();
}

/**
 * Gets the email type from the form dataset.
 * @param {HTMLElement} form - The form.
 * @returns {string|undefined} The email type or undefined if not found.
 */
function getEmailType(form) {
    return form.dataset.membersForm;
}

/**
 * Checks if the form wants OTC.
 * @param {string} emailType - The email type.
 * @param {HTMLElement} form - The form.
 * @returns {boolean} True if the form wants OTC, false otherwise.
 */
function wantsOTC(emailType, form) {
    return emailType === 'signin' && form.dataset.membersOtc === 'true';
}

/**
 * Gets the labels from the form.
 * @param {HTMLElement} form - The form.
 * @returns {string[]} The labels.
 */
function getLabels(form) {
    const labelInputs = form.querySelectorAll('input[data-members-label]');
    return Array.prototype.map.call(labelInputs, labelInput => labelInput.value);
}

/**
 * Gets the newsletters from the form.
 * @param {HTMLElement} form - The form.
 * @returns {object[]} The newsletters.
 */
function getNewsletters(form) {
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked');
    return Array.prototype.map.call(newsletterInputs, newsletterInput => ({name: newsletterInput.value}));
}

/**
 * Handles the form submission.
 * @param {object} options - The options.
 * @param {Event} options.event - The event.
 * @param {HTMLElement} options.form - The form.
 * @param {HTMLElement} options.errorEl - The error element.
 * @param {string} options.siteUrl - The site URL.
 * @param {function} options.submitHandler - The submit handler.
 * @param {function} options.doAction - The do action function.
 * @param {function} options.captureException - The capture exception function.
 */
export async function formSubmitHandler({
    event,
    form,
    errorEl,
    siteUrl,
    submitHandler,
    doAction,
    captureException
}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');

    if (!isValidEmailInput(emailInput)) {
        handleError(new Error(t('Email is required')), form, errorEl);
        return;
    }

    const email = emailInput.value;
    const name = isValidNameInput(nameInput) ? nameInput.value.trim() : undefined;
    const emailType = getEmailType(form);
    const labels = getLabels(form);
    const newsletters = getNewsletters(form);

    const autoRedirect = form.dataset.membersAutoredirect === 'true';
    const wantsOtc = wantsOTC(emailType, form);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: autoRedirect
    };

    if (wantsOtc) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]');
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

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            form.classList.add('success');

            let responseBody;
            if (wantsOtc) {
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
 * Handles the plan click.
 * @param {object} options - The options.
 * @param {Event} options.event - The event.
 * @param {HTMLElement} options.el - The element.
 * @param {HTMLElement} options.errorEl - The error element.
 * @param {string} options.siteUrl - The site URL.
 * @param {object} options.site - The site.
 * @param {object} options.member - The member.
 * @param {function} options.clickHandler - The click handler.
 */
export function planClickHandler({
    event,
    el,
    errorEl,
    siteUrl,
    site,
    member,
    clickHandler
}) {
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

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    })
        .then(res => {
            if (!res.ok) {
                throw new Error(t('Could not get session'));
            }
            return res.text();
        })
        .then(identity => {
            return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...requestData,
                    identity: identity,
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
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
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
 * Handles the data attributes.
 * @param {object} options - The options.
 * @param {string} options.siteUrl - The site URL.
 * @param {object} options.site - The site.
 * @param {object} options.member - The member.
 * @param {object[]} options.offers - The offers.
 * @param {function} options.doAction - The do action function.
 * @param {function} options.captureException - The capture exception function.
 */
export function handleDataAttributes({
    siteUrl,
    site = {},
    member,
    offers = [],
    doAction,
    captureException
} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), el => {
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

        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
                .then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not get session'));
                    }
                    return res.text();
                })
                .then(identity => {
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
                .then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not create stripe checkout session'));
                    }
                    return res.json();
                })
                .then(result => {
                    const stripe = window.Stripe(result.publicKey);
                    return stripe.redirectToCheckout({
                        sessionId: result.sessionId
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
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        let returnUrl;

        if (membersReturn) {
            returnUrl = (new URL(membersReturn, window.location.href)).href;
        }

        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
                .then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not get session'));
                    }
                    return res.text();
                })
                .then(identity => {
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
                .then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not create Stripe billing portal session'));
                    }
                    return res.json();
                })
                .then(result => {
                    return window.location.assign(result.url);
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
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), el => {
        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, {
                method: 'DELETE'
            })
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

    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

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
                .then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not get session'));
                    }
                    return res.text();
                })
                .then(identity => {
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
                .then(res => {
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            const subscriptionId = el.dataset.membersContinueSubscription;

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
                .then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not get session'));
                    }
                    return res.text();
                })
                .then(identity => {
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
                .then(res => {
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