```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ─── Shared Utilities ────────────────────────────────────────────────────────

function clearError(errorEl) {
    if (errorEl) {
        errorEl.innerText = '';
    }
}

function displayError(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function setElementState(el, {add = [], remove = []} = {}) {
    remove.forEach(cls => el.classList.remove(cls));
    add.forEach(cls => el.classList.add(cls));
}

function resolveUrl(base, relative) {
    if (!relative) {
        return undefined;
    }
    return new URL(relative, window.location.href).href;
}

function forEachElement(selector, callback) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), callback);
}

function withReattach(el, eventType, handler, action) {
    el.removeEventListener(eventType, handler);
    return action().catch((err) => {
        console.error(err);
        el.addEventListener(eventType, handler);
        throw err;
    });
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    return res;
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function collectFormData(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    ) || [];
    const checkableNewsletterInputs = event.target.querySelectorAll(
        'input[type=checkbox][data-members-newsletter]'
    ) || [];

    const labels = Array.from(labelInputs).map(el => el.value);
    const newsletters = Array.from(newsletterInputs).map(el => ({name: el.value}));

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels,
        newsletters,
        hasNewsletterInputs: newsletterInputs.length > 0,
        hasCheckableNewsletterInputs: checkableNewsletterInputs.length > 0
    };
}

function buildRequestBody(form, formData, wantsOTC) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm;
    const urlHistory = getUrlHistory();

    const reqBody = {
        email: formData.email,
        emailType,
        labels: formData.labels,
        name: formData.name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }
    if (formData.hasNewsletterInputs) {
        reqBody.newsletters = formData.newsletters;
    } else if (formData.hasCheckableNewsletterInputs) {
        reqBody.newsletters = [];
    }

    return reqBody;
}

async function handleOtcResponse(responseBody, email, doAction, captureException) {
    const otcRef = responseBody?.otc_ref;
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
        console.error(e);
        captureException?.(e);
    }
}

async function sendMagicLink(siteUrl, reqBody) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();
    return postJson(`${siteUrl}/members/api/send-magic-link/`, {...reqBody, integrityToken});
}

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    clearError(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const formData = collectFormData(event);
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const reqBody = buildRequestBody(form, formData, wantsOTC);

    setElementState(form, {add: ['loading']});

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});

            if (wantsOTC) {
                let responseBody;
                try {
                    responseBody = await magicLinkRes.clone().json();
                } catch (e) {
                    responseBody = undefined;
                }
                await handleOtcResponse(responseBody, formData.email, doAction, captureException);
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            displayError(errorEl, chooseBestErrorMessage(error, t('Failed to send magic link email')));
            setElementState(form, {add: ['error']});
        }
    } catch (err) {
        setElementState(form, {add: ['error']});
        displayError(errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
    }
}

// ─── Stripe Helpers ───────────────────────────────────────────────────────────

async function redirectToStripeCheckout(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

function handleElementError(el, errorEl, clickHandler, err) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setElementState(el, {remove: ['loading'], add: ['error']});
    displayError(errorEl, err.message);
}

// ─── Plan Click Handler ───────────────────────────────────────────────────────

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(window.location.href, el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(window.location.href, el.dataset.membersCancel);

    clearError(errorEl);
    setElementState(el, {add: ['loading']});

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetchIdentity(siteUrl)
        .then(identity => postJson(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        }))
        .then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        })
        .then(redirectToStripeCheckout)
        .catch(err => handleElementError(el, errorEl, clickHandler, err));
}

// ─── Data Attribute Handlers ──────────────────────────────────────────────────

function createEditBillingHandler(el, errorEl, siteUrl) {
    const successUrl = resolveUrl(window.location.href, el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(window.location.href, el.dataset.membersCancel);

    function clickHandler(event) {
        event.preventDefault();
        clearError(errorEl);
        setElementState(el, {add: ['loading']});

        withReattach(el, 'click', clickHandler, () =>
            fetchIdentity(siteUrl)
                .then(identity => postJson(`${siteUrl}/members/api/create-stripe-update-session/`, {
                    identity,
                    successUrl,
                    cancelUrl
                }))
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
        ).catch(err => handleElementError(el, errorEl, clickHandler, err));
    }

    return clickHandler;
}

function createManageBillingHandler(el, errorEl, siteUrl) {
    const returnUrl = resolveUrl(window.location.href, el.dataset.membersReturn);

    function clickHandler(event) {
        event.preventDefault();
        clearError(errorEl);
        setElementState(el, {add: ['loading']});

        withReattach(el, 'click', clickHandler, () =>
            fetchIdentity(siteUrl)
                .then(identity => postJson(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    identity,
                    returnUrl
                }))
                .then(res => {
                    if (!res.ok) {
                        throw new Error(t('Could not create Stripe billing portal session'));
                    }
                    return res.json();
                })
                .then(result => window.location.assign(result.url))
        ).catch(err => handleElementError(el, errorEl, clickHandler, err));
    }

    return clickHandler;
}

function createSignOutHandler(el, siteUrl) {
    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementState(el, {remove: ['error'], add: ['loading']});

        fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
            .then(res => {
                if (res.ok) {
                    window.location.replace(siteUrl);
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {remove: ['loading'], add: ['error']});
                }
            });
    }

    return clickHandler;
}

function createCancelSubscriptionHandler(el, errorEl, siteUrl, hasRetentionOffers, doAction) {
    function clickHandler(event) {
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
        setElementState(el, {remove: ['error'], add: ['loading']});
        clearError(errorEl);

        fetchIdentity(siteUrl)
            .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, smart_cancel: true})
            }))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {remove: ['loading'], add: ['error']});
                    displayError(errorEl, t('There was an error cancelling your subscription, please try again.'));
                }
            });
    }

    return clickHandler;
}

function createContinueSubscriptionHandler(el, errorEl, siteUrl) {
    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementState(el, {remove: ['error'], add: ['loading']});
        clearError(errorEl);

        const subscriptionId = el.dataset.membersContinueSubscription;

        fetchIdentity(siteUrl)
            .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, cancel_at_period_end: false})
            }))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {remove: ['loading'], add: ['error']});
                    displayError(errorEl, t('There was an error continuing your subscription, please try again.'));
                }
            });
    }

    return clickHandler;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    forEachElement('form[data-members-form]', (form) => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    forEachElement('[data-members-plan]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener