```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ─── Shared Utilities ────────────────────────────────────────────────────────

function setErrorMessage(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function clearErrorMessage(errorEl) {
    setErrorMessage(errorEl, '');
}

function resolveUrl(base, relative) {
    return relative ? new URL(relative, window.location.href).href : undefined;
}

function forEachElement(selector, callback) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), callback);
}

function setElementState(el, {add = [], remove = []} = {}) {
    remove.forEach(cls => el.classList.remove(cls));
    add.forEach(cls => el.classList.add(cls));
}

async function fetchMemberSession(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

function handleClickError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setElementState(el, {add: ['error'], remove: ['loading']});
    setErrorMessage(errorEl, err.message);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function collectFormInputValues(target, selector, mapper) {
    return Array.from(target.querySelectorAll(selector) || []).map(mapper);
}

function buildRequestBody(params) {
    const {email, emailType, labels, name, autoRedirect, newsletters, wantsOTC, urlHistory, form, event} = params;

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];

    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    return reqBody;
}

async function sendMagicLink(siteUrl, reqBody) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

async function handleOtcResponse(magicLinkRes, email, doAction, captureException) {
    let responseBody;
    try {
        responseBody = await magicLinkRes.clone().json();
    } catch (e) {
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

    clearErrorMessage(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = collectFormInputValues(event.target, 'input[data-members-label]', el => el.value);
    const newsletters = collectFormInputValues(
        event.target,
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked',
        el => ({name: el.value})
    );

    const reqBody = buildRequestBody({
        email, emailType, labels, name, autoRedirect, newsletters, wantsOTC,
        urlHistory: getUrlHistory(), form, event
    });

    setElementState(form, {add: ['loading']});

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});
            if (wantsOTC) {
                await handleOtcResponse(magicLinkRes, email, doAction, captureException);
            }
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            setErrorMessage(errorEl, chooseBestErrorMessage(e, t('Failed to send magic link email')));
            setElementState(form, {add: ['error']});
        }
    } catch (err) {
        setElementState(form, {add: ['error']});
        setErrorMessage(errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
    }
}

// ─── Plan Click Handler ───────────────────────────────────────────────────────

async function createStripeCheckoutSession(siteUrl, payload) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

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

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(null, el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(null, el.dataset.membersCancel);

    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const identity = await fetchMemberSession(siteUrl);
        const responseBody = await createStripeCheckoutSession(siteUrl, {
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        });
        await redirectToStripeCheckout(responseBody);
    } catch (err) {
        handleClickError(err, el, errorEl, clickHandler);
    }
}

// ─── Data Attribute Handlers ──────────────────────────────────────────────────

async function handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);

    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    try {
        const identity = await fetchMemberSession(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, successUrl, cancelUrl})
        });

        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const result = await res.json();
        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});

        if (redirectResult?.error) {
            throw new Error(t(redirectResult.error.message));
        }
    } catch (err) {
        handleClickError(err, el, errorEl, clickHandler);
    }
}

async function handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);

    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    try {
        const identity = await fetchMemberSession(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, returnUrl})
        });

        if (!res.ok) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }

        const result = await res.json();
        window.location.assign(result.url);
    } catch (err) {
        handleClickError(err, el, errorEl, clickHandler);
    }
}

async function handleSignOutClick({el, siteUrl, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    setElementState(el, {add: ['loading'], remove: ['error']});

    const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});

    if (res.ok) {
        window.location.replace(siteUrl);
    } else {
        el.addEventListener('click', clickHandler);
        setElementState(el, {add: ['error'], remove: ['loading']});
    }
}

async function handleCancelSubscriptionClick({el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    setElementState(el, {add: ['loading'], remove: ['error']});
    clearErrorMessage(errorEl);

    try {
        const identity = await fetchMemberSession(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, smart_cancel: true})
        });

        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            setElementState(el, {add: ['error'], remove: ['loading']});
            setErrorMessage(errorEl, t('There was an error cancelling your subscription, please try again.'));
        }
    } catch (err) {
        handleClickError(err, el, errorEl, clickHandler);
    }
}

async function handleContinueSubscriptionClick({el, errorEl, siteUrl, subscriptionId, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    setElementState(el, {add: ['loading'], remove: ['error']});
    clearErrorMessage(errorEl);

    try {
        const identity = await fetchMemberSession(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({identity, cancel_at_period_end: false})
        });

        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            setElementState(el, {add: ['error'], remove: ['loading']});
            setErrorMessage(errorEl, t('There was an error continuing your subscription, please try again.'));
        }
    } catch (err) {
        handleClickError(err, el, errorEl, clickHandler);
    }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

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
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-edit-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(null, el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(null, el.dataset.membersCancel);

        function clickHandler(event) {
            event.preventDefault();
            handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-manage-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(null, el.dataset.membersReturn);

        function clickHandler(event) {
            event.preventDefault();
            handleManageBillingClick({el, errorEl, siteUrl, returnUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-signout]', (el) => {
        function clickHandler(event) {
            event.preventDefault();
            handleSignOutClick({el, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption