```javascript
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

// Extract label inputs from form
function extractLabels(form) {
    const labels = [];
    const labelInputs = form.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

// Extract newsletter inputs from form
function extractNewsletters(form) {
    const newsletters = [];
    const newsletterInputs = form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return {newsletters, newsletterInputs};
}

// Build request body for magic link submission
function buildMagicLinkRequestBody(email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs, urlHistory) {
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: (autoRedirect === 'true')
    };

    if (emailType === 'signin') {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = document.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return reqBody;
}

// Fetch integrity token for form submission
async function fetchIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return await integrityTokenRes.text();
}

// Send magic link request
async function sendMagicLinkRequest(siteUrl, reqBody, integrityToken) {
    return await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

// Handle successful magic link response
async function handleMagicLinkSuccess(magicLinkRes, email, doAction, captureException) {
    let responseBody;
    if (magicLinkRes.headers.get('content-type')?.includes('application/json')) {
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
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = extractLabels(event.target);
    const {newsletters, newsletterInputs} = extractNewsletters(event.target);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildMagicLinkRequestBody(email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs, urlHistory);

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLinkRequest(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            form.classList.add('success');
            await handleMagicLinkSuccess(magicLinkRes, email, doAction, captureException);
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

// Fetch session identity
async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    if (!res.ok) {
        return null;
    }
    return await res.text();
}

// Create Stripe checkout session
async function createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return await res.json();
}

// Handle Stripe redirect or checkout
async function handleStripeCheckout(responseBody) {
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

// Handle plan click error
function handlePlanClickError(err, el, errorEl, clickHandler) {
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

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetchSessionIdentity(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata))
        .then(responseBody => handleStripeCheckout(responseBody))
        .catch(err => handlePlanClickError(err, el, errorEl, clickHandler));
}

// Parse URL from dataset attribute
function parseUrlFromDataset(urlString) {
    if (urlString) {
        return (new URL(urlString, window.location.href)).href;
    }
    return undefined;
}

// Handle edit billing click
async function handleEditBillingClick(el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler) {
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

// Handle manage billing click
async function handleManageBillingClick(el, errorEl, siteUrl, returnUrl, clickHandler) {
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

// Handle signout click
async function handleSignoutClick(el, siteUrl, clickHandler) {
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

// Handle cancel subscription click
async function handleCancelSubscriptionClick(el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler) {
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
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = err.message;
        }
    }
}

// Handle continue subscription click
async function handleContinueSubscriptionClick(el, errorEl, siteUrl, subscriptionId, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
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
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = err.message;
        }
    }
}

// Setup form submission handlers
function setupFormHandlers(siteUrl, doAction, captureException) {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

// Setup plan click handlers
function setupPlanHandlers(siteUrl, site, member) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

// Setup edit billing handlers
function setupEditBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = parseUrlFromDataset(el.dataset.membersSuccess);
        const cancelUrl = parseUrlFromDataset(el.dataset.membersCancel);

        function clickHandler(event) {
            handleEditBillingClick(el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

// Setup manage billing handlers
function setupManageBillingHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = parseUrlFromDataset(el.dataset.membersReturn);

        function clickHandler(event) {
            handleManageBillingClick(el, errorEl, siteUrl, returnUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

// Setup signout handlers
function setupSignoutHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(el, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

// Setup cancel subscription handlers
function setupCancelSubscriptionHandlers(siteUrl, hasRetentionOffers, doAction) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            const subscriptionId = el.dataset.membersCancelSubscription;
            handleCancelSubscriptionClick(el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

// Setup continue subscription handlers
function setupContinueSubscriptionHandlers(siteUrl) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            const subscriptionId = el.dataset.membersContinueSubscription;
            handleContinueSubscriptionClick(el, errorEl, siteUrl, subscriptionId, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    setupFormHandlers(siteUrl, doAction, captureException);
    setupPlanHandlers(siteUrl, site, member);
    setupEditBillingHandlers(siteUrl);
    setupManageBillingHandlers(siteUrl);
    setupSignoutHandlers(siteUrl);
    setupCancelSubscriptionHandlers(siteUrl, hasRetentionOffers, doAction);
    setupContinueSubscriptionHandlers(siteUrl);
}
```