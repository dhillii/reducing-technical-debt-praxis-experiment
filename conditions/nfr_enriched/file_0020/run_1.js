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

function extractFormInputs(form) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    return {email, name};
}

function extractLabels(form) {
    const labels = [];
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

function extractNewsletters(form) {
    const newsletters = [];
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return {newsletters, newsletterInputs};
}

function buildRequestBody(form, email, name, labels, newsletters, newsletterInputs) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
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
        const checkableNewsletterInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return {reqBody, emailType, wantsOTC};
}

async function fetchIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return await integrityTokenRes.text();
}

async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
    return magicLinkRes;
}

function handleOTCResponse(responseBody, email, doAction, captureException) {
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

async function handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException) {
    if (wantsOTC) {
        try {
            const responseBody = await magicLinkRes.clone().json();
            handleOTCResponse(responseBody, email, doAction, captureException);
        } catch (e) {
            // Response body parsing failed, continue without OTC
        }
    }
}

async function handleMagicLinkError(magicLinkRes, errorEl) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
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

    const {email, name} = extractFormInputs(form);
    const labels = extractLabels(form);
    const {newsletters, newsletterInputs} = extractNewsletters(form);
    const {reqBody, emailType, wantsOTC} = buildRequestBody(form, email, name, labels, newsletters, newsletterInputs);

    form.classList.add('loading');

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            form.classList.add('success');
            await handleMagicLinkSuccess(magicLinkRes, wantsOTC, email, doAction, captureException);
        } else {
            await handleMagicLinkError(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

function buildCheckoutUrls(successUrl, cancelUrl) {
    let checkoutSuccessUrl;
    let checkoutCancelUrl;

    if (successUrl) {
        checkoutSuccessUrl = (new URL(successUrl, window.location.href)).href;
    }

    if (cancelUrl) {
        checkoutCancelUrl = (new URL(cancelUrl, window.location.href)).href;
    }

    return {checkoutSuccessUrl, checkoutCancelUrl};
}

function buildCheckoutMetadata(member) {
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return metadata;
}

async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    if (!res.ok) {
        return null;
    }
    return res.text();
}

async function createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

async function handleCheckoutRedirect(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

function handleCheckoutError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const {checkoutSuccessUrl, checkoutCancelUrl} = buildCheckoutUrls(successUrl, cancelUrl);

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const metadata = buildCheckoutMetadata(member);

    return fetchSessionIdentity(siteUrl)
        .then(async (identity) => {
            return createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        })
        .then(handleCheckoutRedirect)
        .catch((err) => {
            handleCheckoutError(err, el, errorEl, clickHandler);
        });
}

async function handleEditBillingClick(event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
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

        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const result = await res.json();
        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({
            sessionId: result.sessionId
        });

        if (redirectResult.error) {
            throw new Error(t(redirectResult.error.message));
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

async function handleManageBillingClick(event, el, errorEl, siteUrl, returnUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: identity,
                returnUrl
            })
        });

        if (!res.ok) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }

        const result = await res.json();
        return window.location.assign(result.url);
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

async function handleSignoutClick(event, el, siteUrl, clickHandler) {
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
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

async function handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction, hasRetentionOffers, clickHandler) {
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

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: identity,
                smart_cancel: true
            })
        });

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
    } catch (err) {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = err.message;
        }
    }
}

async function handleContinueSubscriptionClick(event, el, errorEl, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    const subscriptionId = el.dataset.membersContinueSubscription;

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identity = await fetchSessionIdentity(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity: identity,
                cancel_at_period_end: false
            })
        });

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
    } catch (err) {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = err.message;
        }
    }
}

function setupFormHandlers(siteUrl, doAction, captureException) {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

function setupPlanHandlers(siteUrl, site, member) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

function setupEditBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
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

        function clickHandler(event) {
            handleEditBillingClick(event, el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

function setupManageBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        let returnUrl;

        if (membersReturn) {
            returnUrl = (new URL(membersReturn, window.location.href)).href;
        }

        function clickHandler(event) {
            handleManageBillingClick(event, el, errorEl, siteUrl, returnUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

function setupSignoutHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(event, el, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

function setupCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleCancelSubscriptionClick(event, el, errorEl, siteUrl, doAction, hasRetentionOffers, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

function setupContinueSubscriptionHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleContinueSubscriptionClick(event, el, errorEl, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    setupFormHandlers(siteUrl, doAction, captureException);
    setupPlanHandlers(siteUrl, site, member);
    setupEditBillingHandlers(siteUrl);
    setupManageBillingHandlers(siteUrl);
    setupSignoutHandlers(siteUrl);

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');
    setupCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers);
    setupContinueSubscriptionHandlers(siteUrl);
}