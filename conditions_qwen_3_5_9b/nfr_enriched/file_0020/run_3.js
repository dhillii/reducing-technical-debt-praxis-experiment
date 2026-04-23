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
 * @param {Error} error - The error object.
 * @param {HTMLElement} form - The form element.
 * @param {HTMLElement|null} errorEl - The error message container element.
 */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Extracts and normalizes newsletter subscription data from form inputs.
 * @param {Event} event - The submit event.
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
 * @param {Event} event - The submit event.
 * @param {Array<{name: string}>} newsletters - The extracted newsletter data.
 * @returns {Array<{name: string}>|undefined} Newsletter data or undefined if none.
 */
function determineNewsletterBody(event, newsletters) {
    if (newsletters.length > 0) {
        return newsletters;
    }

    const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];

    if (checkableNewsletterInputs.length > 0) {
        return [];
    }

    return undefined;
}

/**
 * Constructs the request body for the magic link API call.
 * @param {Event} event - The submit event.
 * @param {HTMLElement} form - The form element.
 * @param {string} siteUrl - The base URL of the site.
 * @param {Function} doAction - Function to handle actions.
 * @param {Function} captureException - Function to capture exceptions.
 * @returns {Promise<void>}
 */
async function handleFormSubmission({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
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

    form.classList.add('loading');
    const urlHistory = getUrlHistory();

    const reqBody = {
        email,
        emailType,
        labels: [],
        name,
        autoRedirect: (autoRedirect === 'true')
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    const newsletters = determineNewsletterBody(event, extractNewsletterData(event));
    if (newsletters) {
        reqBody.newsletters = newsletters;
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
 * Handles plan selection clicks to initiate checkout.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {Object} params.site - Site configuration object.
 * @param {Object} params.member - Current member object.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise<void>}
 */
export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
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

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!identityRes.ok) {
            throw new Error('Failed to fetch session');
        }

        const identity = await identityRes.text();

        const checkoutRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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
        });

        if (!checkoutRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const responseBody = await checkoutRes.json();

        if (responseBody.url) {
            window.location.assign(responseBody.url);
        } else {
            const stripe = window.Stripe(responseBody.publicKey);
            await stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            });
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
 * Handles billing edit clicks to initiate a Stripe update session.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise<void>}
 */
async function handleEditBillingClick({event, el, errorEl, siteUrl, clickHandler}) {
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
            throw new Error('Failed to fetch session');
        }

        const identity = await identityRes.text();

        const updateRes = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                successUrl: el.dataset.membersSuccess,
                cancelUrl: el.dataset.membersCancel
            })
        });

        if (!updateRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const result = await updateRes.json();
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
 * Handles billing management clicks to open the Stripe portal.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {string} params.returnUrl - The URL to return to after portal session.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise<void>}
 */
async function handleManageBillingClick({event, el, errorEl, siteUrl, returnUrl, clickHandler}) {
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
            throw new Error('Failed to fetch session');
        }

        const identity = await identityRes.text();

        const portalRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                returnUrl
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
 * Handles signout clicks by deleting the session.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise<void>}
 */
async function handleSignoutClick({event, el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {
            method: 'DELETE'
        });

        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

/**
 * Handles subscription cancellation clicks.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {string} params.subscriptionId - The subscription ID to cancel.
 * @param {boolean} params.hasRetentionOffers - Whether retention offers are available.
 * @param {Function} params.doAction - Function to handle actions.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise<void>}
 */
async function handleCancelSubscriptionClick({event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler}) {
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

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!identityRes.ok) {
            throw new Error('Failed to fetch session');
        }

        const identity = await identityRes.text();

        const cancelRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                smart_cancel: true
            })
        });

        if (cancelRes.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');

            if (errorEl) {
                errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

/**
 * Handles subscription continuation clicks.
 * @param {Object} params - Function parameters.
 * @param {Event} params.event - The click event.
 * @param {HTMLElement} params.el - The clicked element.
 * @param {HTMLElement|null} params.errorEl - The error message container.
 * @param {string} params.siteUrl - The base URL of the site.
 * @param {string} params.subscriptionId - The subscription ID to continue.
 * @param {Function} params.clickHandler - Original click handler to restore.
 * @returns {Promise<void>}
 */
async function handleContinueSubscriptionClick({event, el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identityRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!identityRes.ok) {
            throw new Error('Failed to fetch session');
        }

        const identity = await identityRes.text();

        const continueRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                cancel_at_period_end: false
            })
        });

        if (continueRes.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');

            if (errorEl) {
                errorEl.innerText = t('There was an error continuing your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

/**
 * Initializes event listeners for all data attributes on the page.
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
        const submitHandler = (event) => {
            handleFormSubmission({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = (event) => {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = (event) => {
            handleEditBillingClick({event, el, errorEl, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn ? new URL(el.dataset.membersReturn, window.location.href).href : undefined;
        const clickHandler = (event) => {
            handleManageBillingClick({event, el, errorEl, siteUrl, returnUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        const clickHandler = (event) => {
            handleSignoutClick({event, el, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;
        const clickHandler = (event) => {
            handleCancelSubscriptionClick({event, el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;
        const clickHandler = (event) => {
            handleContinueSubscriptionClick({event, el, errorEl, siteUrl, subscriptionId, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });
}