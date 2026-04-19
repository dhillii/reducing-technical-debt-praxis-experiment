/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
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
 * @param {string} value
 * @returns {boolean}
 */
function isTruthy(value) {
    return !!value;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isFalsey(value) {
    return !value;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isString(value) {
    return typeof value === 'string';
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isDefined(value) {
    return value !== undefined && value !== null;
}

/**
 * @param {string} emailType
 * @param {Object} dataset
 * @returns {boolean}
 */
function isOTCRequest(emailType, dataset) {
    return emailType === 'signin' && dataset?.membersOtc === 'true';
}

/**
 * @param {Object} form
 * @returns {string|undefined}
 */
function getEmailType(form) {
    return form?.dataset?.membersForm;
}

/**
 * @param {HTMLFormElement} form
 * @returns {string}
 */
function getAutoRedirect(form) {
    return form?.dataset?.membersAutoredirect || 'true';
}

/**
 * @param {HTMLFormElement} form
 * @returns {string}
 */
function getSiteUrl(form) {
    return form?.dataset?.siteUrl || '';
}

/**
 * @param {Event} event
 * @returns {string}
 */
function getEmailFromEvent(event) {
    const input = event.target.querySelector('input[data-members-email]');
    return input?.value ?? '';
}

/**
 * @param {Event} event
 * @returns {string|undefined}
 */
function getNameFromEvent(event) {
    const input = event.target.querySelector('input[data-members-name]');
    const value = input?.value ?? '';
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

/**
 * @param {Event} event
 * @returns {string[]}
 */
function getLabelsFromEvent(event) {
    const inputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const labels = [];
    for (let i = 0; i < inputs.length; ++i) {
        labels.push(inputs[i].value);
    }
    return labels;
}

/**
 * @param {Event} event
 * @returns {{name: string}[]}
 */
function getNewslettersFromEvent(event) {
    const inputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    ) || [];
    const newsletters = [];
    for (let i = 0; i < inputs.length; ++i) {
        newsletters.push({name: inputs[i].value});
    }
    return newsletters;
}

/**
 * @param {Event} event
 * @returns {boolean}
 */
function hasCheckableNewsletterInputs(event) {
    const inputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return inputs.length > 0;
}

/**
 * @param {string} siteUrl
 * @param {string} email
 * @param {string|undefined} emailType
 * @param {string[]} labels
 * @param {string|undefined} name
 * @param {boolean} autoRedirect
 * @param {boolean} wantsOTC
 * @param {string[]} newsletters
 * @param {string|null} urlHistory
 * @returns {Object}
 */
function buildRequestBody(
    siteUrl,
    email,
    emailType,
    labels,
    name,
    autoRedirect,
    wantsOTC,
    newsletters,
    urlHistory
) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect
    };
    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (newsletters.length > 0) {
        body.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs(event)) {
        body.newsletters = [];
    }
    return body;
}

/**
 * @param {Object} params
 * @returns {Promise<void>}
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

    const email = getEmailFromEvent(event);
    const name = getNameFromEvent(event);
    const emailType = getEmailType(form);
    const autoRedirect = getAutoRedirect(form);
    const labels = getLabelsFromEvent(event);
    const newsletters = getNewslettersFromEvent(event);
    const wantsOTC = isOTCRequest(emailType, form?.dataset);

    form.classList.add('loading');

    const urlHistory = getUrlHistory();

    const reqBody = buildRequestBody(
        siteUrl,
        email,
        emailType,
        labels,
        name,
        autoRedirect === 'true',
        wantsOTC,
        newsletters,
        urlHistory
    );

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

        if (!magicLinkRes.ok) {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
            return;
        }

        form.classList.add('success');

        let responseBody;
        if (wantsOTC) {
            try {
                responseBody = await magicLinkRes.clone().json();
            } catch {
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
        handleError(err, form, errorEl);
    }
}

/**
 * @param {Object} params
 * @returns {Promise<void>}
 */
export async function planClickHandler({
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

    const checkoutSuccessUrl = successUrl
        ? new URL(successUrl, window.location.href).href
        : undefined;
    const checkoutCancelUrl = cancelUrl
        ? new URL(cancelUrl, window.location.href).href
        : undefined;

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};

    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });
        if (!sessionRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        const identity = await sessionRes.text();

        const checkoutRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

        if (!checkoutRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const responseBody = await checkoutRes.json();

        if (responseBody.url) {
            window.location.assign(responseBody.url);
            return;
        }

        const stripe = window.Stripe(responseBody.publicKey);
        const redirectResult = await stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        });

        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
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
 * @param {Object} [options]
 * @param {string} [options.siteUrl]
 * @param {Object} [options.site]
 * @param {Object} [options.member]
 * @param {Array} [options.offers]
 * @param {Function} [options.doAction]
 * @param {Function} [options.captureException]
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
        const successUrl = membersSuccess
            ? new URL(membersSuccess, window.location.href).href
            : undefined;
        const cancelUrl = membersCancel
            ? new URL(membersCancel, window.location.href).href
            : undefined;

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
                .then(function (res) {
                    if (!res.ok) {
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
                    if (!res.ok) {
                        throw new Error(t('Could not create stripe checkout session'));
                    }
                    return res.json();
                })
                .then(function (result) {
                    const stripe = window.Stripe(result.publicKey);
                    return stripe.redirectToCheckout({
                        sessionId: result.sessionId
                    });
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn
            ? new URL(membersReturn, window.location.href).href
            : undefined;

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
                .then(function (res) {
                    if (!res.ok) {
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
                    if (!res.ok) {
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
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
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
                .then(function (res) {
                    if (!res.ok) {
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

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
                .then(function (res) {
                    if (!res.ok) {
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