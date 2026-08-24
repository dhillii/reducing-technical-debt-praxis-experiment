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

// Extracts form data for submission
function extractFormData(event, form) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');

    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;

    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(input => input.value);

    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked');
    const newsletters = Array.from(newsletterInputs).map(input => ({name: input.value}));

    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return {
        email,
        name,
        emailType,
        labels,
        newsletters,
        autoRedirect: autoRedirect === 'true',
        wantsOTC,
        checkableNewsletterInputs
    };
}

function buildRequestPayload(data, urlHistory) {
    const reqBody = {
        email: data.email,
        emailType: data.emailType,
        labels: data.labels,
        name: data.name,
        autoRedirect: data.autoRedirect
    };

    if (data.wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (data.newsletters.length > 0) {
        reqBody.newsletters = data.newsletters;
    } else if (data.checkableNewsletterInputs.length > 0) {
        reqBody.newsletters = [];
    }

    return reqBody;
}

function createMagicLinkRequest(siteUrl, reqBody, integrityToken) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

async function handleSuccessResponse(magicLinkRes, wantsOTC, email, doAction, captureException) {
    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
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
}

async function handleMagicLinkResponse(magicLinkRes, errorEl, wantsOTC, email, doAction, captureException) {
    if (magicLinkRes.ok) {
        await handleSuccessResponse(magicLinkRes, wantsOTC, email, doAction, captureException);
        return 'success';
    } else {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        displayErrorIfElementExists(errorEl, errorMessage);
        return 'error';
    }
}

// Handles form submission logic
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
    const urlHistory = getUrlHistory();
    const formData = extractFormData(event, form);
    const reqBody = buildRequestPayload(formData, urlHistory);

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await createMagicLinkRequest(siteUrl, reqBody, integrityToken);

        form.classList.add('loading');

        const resultStatus = await handleMagicLinkResponse(magicLinkRes, errorEl, formData.wantsOTC, formData.email, doAction, captureException);
        form.classList.remove('loading');

        if (resultStatus === 'success') {
            form.classList.add('success');
        } else if (resultStatus === 'error') {
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

// Extracts plan click handler data
function extractPlanClickData(el, site) {
    constplan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    return {plan, requestData, el};
}

function extractUrlParameters(el, paramName, base) {
    const value = el.dataset[paramName];
    return value ? (new URL(value, base)).href : undefined;
}

// Handles plan selection and checkout creation
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    const {requestData} = extractPlanClickData(el, site);
    const successUrl = extractUrlParameters(el, 'membersSuccess', window.location.href);
    const cancelUrl = extractUrlParameters(el, 'membersCancel', window.location.href);

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(response => response.ok ? response.text() : null)
        .then(identity => {
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
            });
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return response.json();
        })
        .then(responseBody => {
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        })
        .then(result => {
            if (result?.error) {
                throw new Error(result.error.message);
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

// Handles edit billing click
function handleEditBillingClick({el, event, errorEl, successUrl, cancelUrl, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.add('loading');

    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(response => response.ok ? response.text() : null)
        .then(identity => {
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
        .then(response => {
            if (!response.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return response.json();
        })
        .then(result => {
            const stripe = window.Stripe(result.publicKey);
            return stripe.redirectToCheckout({sessionId: result.sessionId});
        })
        .then(result => {
            if (result?.error) {
                throw new Error(result.error.message);
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

// Handles manage billing click
function handleManageBillingClick({el, event, errorEl, returnUrl, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.add('loading');

    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(response => response.ok ? response.text() : null)
        .then(identity => {
            return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    returnUrl
                })
            });
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(t('Could not create Stripe billing portal session'));
            }
            return response.json();
        })
        .then(result => window.location.assign(result.url))
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

// Handles sign out click
function handleSignoutClick({el, event, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    return fetch(`${siteUrl}/members/api/session`, {
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
}

// Handles cancel subscription click
function handleCancelSubscriptionClick({el, event, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler}) {
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

    fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(response => response.ok ? response.text() : null)
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
}

// Handles continue subscription click
function handleContinueSubscriptionClick({el, event, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(response => response.ok ? response.text() : null)
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
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    // Handle signout forms
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick({el, event, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // Handle form submissions
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    // Handle plan selections
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // Handle edit billing
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;

        function clickHandler(event) {
            handleEditBillingClick({
                el,
                event,
                errorEl,
                successUrl,
                cancelUrl,
                siteUrl,
                clickHandler
            });
        }
        el.addEventListener('click', clickHandler);
    });

    // Handle manage billing
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

        function clickHandler(event) {
            handleManageBillingClick({
                el,
                event,
                errorEl,
                returnUrl,
                siteUrl,
                clickHandler
            });
        }
        el.addEventListener('click', clickHandler);
    });

    // Handle cancel subscriptions
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;

        function clickHandler(event) {
            handleCancelSubscriptionClick({
                el,
                event,
                errorEl,
                siteUrl,
                subscriptionId,
                hasRetentionOffers,
                doAction,
                clickHandler
            });
        }
        el.addEventListener('click', clickHandler);
    });

    // Handle continue subscriptions
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;

        function clickHandler(event) {
            handleContinueSubscriptionClick({
                el,
                event,
                errorEl,
                siteUrl,
                subscriptionId,
                clickHandler
            });
        }
        el.addEventListener('click', clickHandler);
    });
}