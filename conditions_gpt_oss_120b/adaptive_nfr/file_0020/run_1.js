/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/**
 * Show an error message in the provided element if it exists.
 * @param {HTMLElement|null} errorEl
 * @param {string} message
 */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Apply error styling and display a human‑readable message.
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
 * Determine whether the form request should include an OTC flag.
 * @param {string|undefined} emailType
 * @param {HTMLFormElement} form
 * @returns {boolean}
 */
function shouldIncludeOTC(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

/**
 * Determine if the form has any newsletter inputs checked.
 * @param {NodeListOf<Element>} newsletterInputs
 * @returns {boolean}
 */
function hasCheckedNewsletters(newsletterInputs) {
    return newsletterInputs.length > 0;
}

/**
 * Determine if the form contains any checkable newsletter inputs.
 * @param {HTMLElement} target
 * @returns {boolean}
 */
function hasCheckableNewsletterInputs(target) {
    const inputs = target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return inputs.length > 0;
}

/**
 * Build the request body for the magic‑link API.
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
    if (newsletters !== undefined) {
        body.newsletters = newsletters;
    }
    return body;
}

/**
 * Extract label values from the form event.
 * @param {Event} event
 * @returns {string[]}
 */
function collectLabels(event) {
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const labels = [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

/**
 * Extract newsletter selections from the form event.
 * @param {Event} event
 * @returns {{newsletters: {name:string}[]|undefined, emptyIfUnchecked:boolean}}
 */
function collectNewsletters(event) {
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    if (hasCheckedNewsletters(newsletterInputs)) {
        const newsletters = [];
        for (let i = 0; i < newsletterInputs.length; ++i) {
            newsletters.push({name: newsletterInputs[i].value});
        }
        return {newsletters, emptyIfUnchecked: false};
    }

    if (hasCheckableNewsletterInputs(event.target)) {
        return {newsletters: [], emptyIfUnchecked: true};
    }

    return {newsletters: undefined, emptyIfUnchecked: false};
}

/**
 * Process the magic‑link response, handling OTC actions if needed.
 * @param {Response} magicLinkRes
 * @param {boolean} wantsOTC
 * @param {string} email
 * @param {Function} doAction
 * @param {Function|undefined} captureException
 * @param {HTMLFormElement} form
 * @param {HTMLElement|null} errorEl
 */
async function handleMagicLinkResponse(magicLinkRes, wantsOTC, email, doAction, captureException, form, errorEl) {
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
}

/**
 * Submit the magic‑link request.
 * @param {string} siteUrl
 * @param {Object} reqBody
 * @returns {Promise<Response>}
 */
function sendMagicLinkRequest(siteUrl, reqBody) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(reqBody)
    });
}

/**
 * Main form submit handler – flattened with guard clauses.
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

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;

    const labels = collectLabels(event);
    const {newsletters, emptyIfUnchecked} = collectNewsletters(event);
    const wantsOTC = shouldIncludeOTC(emailType, form);
    const urlHistory = getUrlHistory();

    const reqBody = buildRequestBody({
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters: newsletters !== undefined ? newsletters : emptyIfUnchecked ? [] : undefined
    });

    form.classList.add('loading');

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await sendMagicLinkRequest(siteUrl, {...reqBody, integrityToken});
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        await handleMagicLinkResponse(magicLinkRes, wantsOTC, email, doAction, captureException, form, errorEl);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Determine if a URL string is provided.
 * @param {string|undefined} url
 * @returns {boolean}
 */
function hasUrl(url) {
    return !!url;
}

/**
 * Resolve a relative URL against the current location.
 * @param {string} url
 * @returns {string}
 */
function resolveUrl(url) {
    return (new URL(url, window.location.href)).href;
}

/**
 * Build metadata for checkout sessions.
 * @param {Object|null} member
 * @param {string|undefined} urlHistory
 * @returns {Object}
 */
function buildMetadata(member, urlHistory) {
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }
    return metadata;
}

/**
 * Create a Stripe checkout session and redirect the user.
 * @param {string} siteUrl
 * @param {Object} requestData
 * @param {string|undefined} successUrl
 * @param {string|undefined} cancelUrl
 * @param {Object} metadata
 * @returns {Promise<void>}
 */
async function createAndRedirectCheckout(siteUrl, requestData, successUrl, cancelUrl, metadata) {
    const identityRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!identityRes.ok) {
        throw new Error(t('Could not retrieve identity'));
    }
    const identity = await identityRes.text();

    const sessionRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        })
    });

    if (!sessionRes.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const responseBody = await sessionRes.json();

    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }

    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

/**
 * Plan click handler – flattened with guard clauses.
 */
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());

    const successUrl = hasUrl(el.dataset.membersSuccess) ? resolveUrl(el.dataset.membersSuccess) : undefined;
    const cancelUrl = hasUrl(el.dataset.membersCancel) ? resolveUrl(el.dataset.membersCancel) : undefined;

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const metadata = buildMetadata(member, getUrlHistory());

    createAndRedirectCheckout(siteUrl, requestData, successUrl, cancelUrl, metadata)
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
 * Initialize form submit handlers for all forms with data-members-form.
 * @param {string} siteUrl
 * @param {Function} doAction
 * @param {Function|undefined} captureException
 */
function initFormHandlers(siteUrl, doAction, captureException) {
    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });
}

/**
 * Initialize plan click handlers for all elements with data-members-plan.
 * @param {string} siteUrl
 * @param {Object} site
 * @param {Object|null} member
 */
function initPlanHandlers(siteUrl, site, member) {
    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => {
            planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler});
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize edit‑billing click handlers.
 * @param {string} siteUrl
 */
function initEditBillingHandlers(siteUrl) {
    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess ? resolveUrl(el.dataset.membersSuccess) : undefined;
        const cancelUrl = el.dataset.membersCancel ? resolveUrl(el.dataset.membersCancel) : undefined;

        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(res => (res.ok ? res.text() : null))
                .then(identity => {
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
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize manage‑billing click handlers.
 * @param {string} siteUrl
 */
function initManageBillingHandlers(siteUrl) {
    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn ? resolveUrl(el.dataset.membersReturn) : undefined;

        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(res => (res.ok ? res.text() : null))
                .then(identity => {
                    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({identity, returnUrl})
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
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize sign‑out click handlers.
 * @param {string} siteUrl
 */
function initSignoutHandlers(siteUrl) {
    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = event => {
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
                });
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize cancel‑subscription click handlers.
 * @param {string} siteUrl
 * @param {Array<Object>} offers
 * @param {Function} doAction
 */
function initCancelSubscriptionHandlers(siteUrl, offers, doAction) {
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        const clickHandler = event => {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction('openPopup', {
                    page: 'accountPlan',
                    pageData: {subscriptionId, action: 'cancel'}
                });
                return;
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(res => (res.ok ? res.text() : null))
                .then(identity => {
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
                });
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Initialize continue‑subscription click handlers.
 * @param {string} siteUrl
 */
function initContinueSubscriptionHandlers(siteUrl) {
    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
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

            fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
                .then(res => (res.ok ? res.text() : null))
                .then(identity => {
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
                });
        };
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Public entry point – registers all data‑attribute handlers.
 */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    initFormHandlers(siteUrl, doAction, captureException);
    initPlanHandlers(siteUrl, site, member);
    initEditBillingHandlers(siteUrl);
    initManageBillingHandlers(siteUrl);
    initSignoutHandlers(siteUrl);
    initCancelSubscriptionHandlers(siteUrl, offers, doAction);
    initContinueSubscriptionHandlers(siteUrl);
}