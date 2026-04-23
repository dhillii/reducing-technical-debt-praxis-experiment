/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Display an error message if the element exists.
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Apply error styling and display a message.
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
 * Guard predicate: determines if OTC flow is requested.
 * @param {string|undefined} emailType
 * @param {HTMLFormElement} form
 * @returns {boolean}
 */
function isWantsOTC(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

/**
 * Guard predicate: checks if newsletter inputs exist.
 * @param {NodeListOf<Element>} inputs
 * @returns {boolean}
 */
function hasNewsletterInputs(inputs) {
    return inputs.length > 0;
}

/**
 * Guard predicate: checks if any checkable newsletter inputs exist.
 * @param {Element} target
 * @returns {boolean}
 */
function hasCheckableNewsletterInputs(target) {
    const inputs = target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return inputs.length > 0;
}

/**
 * Build request body for magic link submission.
 * @param {Object} params
 * @returns {Object}
 */
function buildRequestBody({email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters}) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: (autoRedirect === 'true')
    };
    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (newsletters && newsletters.length > 0) {
        body.newsletters = newsletters;
    }
    return body;
}

/**
 * Extract form inputs and related data.
 * @param {Event} event
 * @param {HTMLFormElement} form
 * @returns {Object}
 */
function extractFormData(event, form) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    const labels = Array.from(labelInputs, el => el.value);
    const newsletters = Array.from(newsletterInputs, el => ({name: el.value}));

    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';

    return {
        email,
        name,
        emailType,
        autoRedirect,
        labels,
        newsletters,
        newsletterInputs
    };
}

/**
 * Fetch integrity token from the API.
 * @param {string} siteUrl
 * @returns {Promise<string>}
 */
async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return await res.text();
}

/**
 * Send magic link request.
 * @param {string} siteUrl
 * @param {Object} body
 * @returns {Promise<Response>}
 */
function sendMagicLink(siteUrl, body) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
}

/**
 * Process successful magic link response.
 * @param {Response} response
 * @param {boolean} wantsOTC
 * @param {Function} doAction
 * @param {string} email
 * @param {Function} captureException
 * @returns {Promise<void>}
 */
async function handleMagicLinkSuccess(response, wantsOTC, doAction, email, captureException) {
    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await response.clone().json();
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
}

/**
 * Main form submit handler.
 * @param {Object} param0
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

    const {
        email,
        name,
        emailType,
        autoRedirect,
        labels,
        newsletters,
        newsletterInputs
    } = extractFormData(event, form);

    const wantsOTC = isWantsOTC(emailType, form);
    form.classList.add('loading');

    const urlHistory = getUrlHistory();
    const requestBody = buildRequestBody({
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters: hasNewsletterInputs(newsletterInputs) ? newsletters : undefined
    });

    if (!hasNewsletterInputs(newsletterInputs) && hasCheckableNewsletterInputs(event.target)) {
        requestBody.newsletters = [];
    }

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, {...requestBody, integrityToken});

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (!magicLinkRes.ok) {
            const apiError = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(apiError, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
            return;
        }

        form.classList.add('success');
        await handleMagicLinkSuccess(magicLinkRes, wantsOTC, doAction, email, captureException);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Guard predicate: checks if response contains a URL.
 * @param {Object} body
 * @returns {boolean}
 */
function responseHasUrl(body) {
    return !!body.url;
}

/**
 * Guard predicate: checks if Stripe redirect result contains an error.
 * @param {Object} result
 * @returns {boolean}
 */
function redirectResultHasError(result) {
    return !!result.error;
}

/**
 * Create Stripe checkout session and redirect.
 * @param {Object} params
 * @returns {Promise<void>}
 */
async function processCheckoutSession({siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata}) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const body = await res.json();

    if (responseHasUrl(body)) {
        window.location.assign(body.url);
        return;
    }

    const stripe = window.Stripe(body.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: body.sessionId});
    if (redirectResultHasError(redirectResult)) {
        throw new Error(redirectResult.error.message);
    }
}

/**
 * Plan click handler.
 * @param {Object} param0
 */
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = el.dataset.membersSuccess
        ? (new URL(el.dataset.membersSuccess, window.location.href)).href
        : undefined;
    const checkoutCancelUrl = el.dataset.membersCancel
        ? (new URL(el.dataset.membersCancel, window.location.href)).href
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
        fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
            .then(res => (res.ok ? res.text() : null))
            .then(identity => processCheckoutSession({
                siteUrl,
                requestData,
                identity,
                checkoutSuccessUrl,
                checkoutCancelUrl,
                metadata
            }))
            .catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                el.classList.add('error');
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
 * Guard predicate: checks if a URL is provided.
 * @param {string|undefined} url
 * @returns {boolean}
 */
function hasUrl(url) {
    return !!url;
}

/**
 * Common fetch helper for session identity.
 * @param {string} siteUrl
 * @returns {Promise<string|null>}
 */
function fetchSessionIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => (res.ok ? res.text() : null));
}

/**
 * Edit billing click handler.
 * @param {Object} param0
 */
function editBillingHandler({el, errorEl, siteUrl, membersSuccess, membersCancel, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const successUrl = hasUrl(membersSuccess) ? (new URL(membersSuccess, window.location.href)).href : undefined;
    const cancelUrl = hasUrl(membersCancel) ? (new URL(membersCancel, window.location.href)).href : undefined;

    fetchSessionIdentity(siteUrl)
        .then(identity => {
            if (!identity) {
                throw new Error(t('Could not retrieve session identity'));
            }
            return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, successUrl, cancelUrl})
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
            return stripe.redirectToCheckout({sessionId: result.sessionId});
        })
        .then(result => {
            if (result.error) {
                throw new Error(t(result.error.message));
            }
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
 * Manage billing click handler.
 * @param {Object} param0
 */
function manageBillingHandler({el, errorEl, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    fetchSessionIdentity(siteUrl)
        .then(identity => {
            if (!identity) {
                throw new Error(t('Could not retrieve session identity'));
            }
            return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, returnUrl: undefined})
            });
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create Stripe billing portal session'));
            }
            return res.json();
        })
        .then(result => {
            window.location.assign(result.url);
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
 * Signout click handler.
 * @param {Object} param0
 */
function signoutHandler({el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
        .then(res => {
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
            }
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        });
}

/**
 * Cancel subscription click handler.
 * @param {Object} param0
 */
function cancelSubscriptionHandler({el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler}) {
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

    fetchSessionIdentity(siteUrl)
        .then(identity => {
            if (!identity) {
                throw new Error(t('Could not retrieve session identity'));
            }
            return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, smart_cancel: true})
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
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) {
                errorEl.innerText = err.message;
            }
        });
}

/**
 * Continue subscription click handler.
 * @param {Object} param0
 */
function continueSubscriptionHandler({el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    fetchSessionIdentity(siteUrl)
        .then(identity => {
            if (!identity) {
                throw new Error(t('Could not retrieve session identity'));
            }
            return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, cancel_at_period_end: false})
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
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
            if (errorEl) {
                errorEl.innerText = err.message;
            }
        });
}

/**
 * Main data-attributes handler.
 * @param {Object} param0
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // Form submissions
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Plan clicks
    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const clickHandler = event => {
            editBillingHandler({el, errorEl, siteUrl, membersSuccess, membersCancel, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Manage billing
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            manageBillingHandler({el, errorEl, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    // Signout
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = event => {
            signoutHandler({el, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Cancel subscription
    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            const subscriptionId = el.dataset.membersCancelSubscription;
            cancelSubscriptionHandler({
                el,
                errorEl,
                siteUrl,
                subscriptionId,
                hasRetentionOffers,
                doAction,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = event => {
            const subscriptionId = el.dataset.membersContinueSubscription;
            continueSubscriptionHandler({
                el,
                errorEl,
                siteUrl,
                subscriptionId,
                clickHandler
            });
        };
        el.addEventListener('click', clickHandler);
    });
}