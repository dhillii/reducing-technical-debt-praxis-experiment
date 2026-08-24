/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Builds request body for magic link submission.
 * Extracted to reduce nesting and improve readability.
 */
function buildRequestData({form, email, name, emailType, wantsOTC, urlHistory, newsletterInputs}) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';

    const reqBody = {
        email,
        emailType,
        labels: extractLabels(form),
        name: name || undefined,
        autoRedirect: (autoRedirect === 'true')
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    const hasCheckedNewsletters = newsletterInputs.some(node => {
        return node.type === 'hidden' || node.checked;
    });

    if (hasCheckedNewsletters) {
        reqBody.newsletters = newsletterInputs.map(node => ({name: node.value}));
    } else {
        // If there were checkable newsletter inputs but none were checked, ensure newsletters is empty array
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return reqBody;
}

/**
 * Extracts labels from form inputs with data-members-label attribute.
 */
function extractLabels(form) {
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    const labels = [];

    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }

    return labels;
}

/**
 * Sends integrity token and magic link request.
 */
async function fetchMagicLink({siteUrl, reqBody}) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

/**
 * Handles OTC-specific logic upon successful magic link response.
 */
async function handleOTCResponse({magicLinkRes, email, doAction, captureException}) {
    let responseBody;
    try {
        responseBody = await magicLinkRes.clone().json();
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        return;
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
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;

    const emailType = form?.dataset?.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');

    const urlHistory = getUrlHistory();
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    const reqBody = buildRequestData({form, email, name, emailType, wantsOTC, urlHistory, newsletterInputs});

    try {
        const magicLinkRes = await fetchMagicLink({siteUrl, reqBody});

        form.classList.remove('loading');
        if (magicLinkRes.ok) {
            form.classList.add('success');
            await handleOTCResponse({magicLinkRes, email, doAction, captureException});
        } else {
            const humanReadableError = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(humanReadableError, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }

    form.addEventListener('submit', submitHandler);
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
    const successUrl = buildValidatedUrl(el.dataset.membersSuccess);
    const cancelUrl = buildValidatedUrl(el.dataset.membersCancel);
    const metadata = buildCheckoutMetadata(member);
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetchIdentitySession(siteUrl)
        .then(identity => createStripeCheckoutSession({siteUrl, requestData, identity, successUrl, cancelUrl, metadata}))
        .then(responseBody => handleCheckoutResponse(responseBody));
}

/**
 * Builds a validated URL from raw string.
 * Used to ensure relative URLs become absolute.
 */
function buildValidatedUrl(rawUrl) {
    if (!rawUrl) {
        return undefined;
    }
    return (new URL(rawUrl, window.location.href)).href;
}

/**
 * Constructs metadata object for Stripe checkout session.
 */
function buildCheckoutMetadata(member) {
    const metadata = {};
    if (member) {
        metadata.checkoutType = 'upgrade';
    }
    return metadata;
}

/**
 * Fetches identity token from members API session endpoint.
 */
function fetchIdentitySession(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });
}

/**
 * Creates a Stripe checkout session.
 */
function createStripeCheckoutSession({siteUrl, requestData, identity, successUrl, cancelUrl, metadata}) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
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
 * Handles successful checkout response.
 */
function handleCheckoutResponse(responseBody) {
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
}

/**
 * attaches planClickHandler to elements and handles error regeneration.
 */
function registerPlanClickHandler({el, errorEl, siteUrl, member, site, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    planClickHandler({event: window.event, el, errorEl, siteUrl, site, member, clickHandler})
        .catch(err => handleElementError({el, errorEl, err, clickHandler}));
}

/**
 * Updates error state for plan-click elements.
 */
function handleElementError({el, errorEl, err, clickHandler}) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message || err;
    }
    el.classList.add('error');
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // Register form handlers
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    // Register plan click handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            registerPlanClickHandler({el, errorEl, siteUrl, member, site, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // Register edit billing handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = buildValidatedUrl(el.dataset.membersSuccess);
        const cancelUrl = buildValidatedUrl(el.dataset.membersCancel);

        function clickHandler(event) {
            handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // Register manage billing handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = buildValidatedUrl(el.dataset.membersReturn);

        function clickHandler(event) {
            handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // Register signout handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
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
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Register cancel subscription handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const parentForm = el.closest('form') || el.parentElement;
        const errorEl = parentForm.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleCancelSubscriptionClick({el, errorEl, hasRetentionOffers, doAction, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // Register continue subscription handlers
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const parentForm = el.closest('form') || el.parentElement;
        const errorEl = parentForm.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleContinueSubscriptionClick({el, errorEl, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Handles edit billing click with delegated Stripe session creation.
 */
function handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    fetchIdentitySession(siteUrl).then(identity => {
        return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
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
        const stripe = window.Stripe(result.publicKey);
        return stripe.redirectToCheckout({
            sessionId: result.sessionId
        });
    }).then(function () {
        // Success handled implicitly
    }).catch(function (err) {
        handleElementError({el, errorEl, err, clickHandler});
    }).then(function () {
        el.classList.remove('loading');
        el.addEventListener('click', clickHandler);
    });
}

/**
 * Handles manage billing click.
 */
function handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    fetchIdentitySession(siteUrl).then(identity => {
        return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
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
        handleElementError({el, errorEl, err, clickHandler});
    });
}

/**
 * Handles cancel subscription clicks.
 */
function handleCancelSubscriptionClick({el, errorEl, hasRetentionOffers, doAction, clickHandler}) {
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

    fetchIdentitySession(el.dataset.membersApiBaseUrl || siteUrl).then(identity => {
        return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
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
    }).catch(function (err) {
        handleElementError({el, errorEl, err, clickHandler});
    });
}

/**
 * Handles continue subscription clicks.
 */
function handleContinueSubscriptionClick({el, errorEl, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    const subscriptionId = el.dataset.membersContinueSubscription;

    if (errorEl) {
        errorEl.innerText = '';
    }

    fetchIdentitySession(siteUrl).then(identity => {
        return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
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
    }).catch(function (err) {
        handleElementError({el, errorEl, err, clickHandler});
    });
}