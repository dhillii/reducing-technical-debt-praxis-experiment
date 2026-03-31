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
    return relative ? new URL(relative, window.location.href).href : undefined;
}

function forEachElement(selector, callback) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), callback);
}

async function fetchMemberSession(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

function handleElementError(el, clickHandler, errorEl, message) {
    console.error(message);
    el.addEventListener('click', clickHandler);
    setElementState(el, {add: ['error'], remove: ['loading']});
    displayError(errorEl, message instanceof Error ? message.message : message);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function collectFormInputValues(target, selector, mapper) {
    return Array.from(target.querySelectorAll(selector) || []).map(mapper);
}

function buildNewsletterPayload(target, newsletterInputs) {
    if (newsletterInputs.length > 0) {
        return newsletterInputs.map(el => ({name: el.value}));
    }
    const checkable = target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkable.length > 0 ? [] : undefined;
}

function buildRequestBody({email, emailType, labels, name, autoRedirect, newsletters, urlHistory, wantsOTC}) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
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

async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return res.text();
}

async function sendMagicLink(siteUrl, body) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
}

async function handleOtcResponse(magicLinkRes, email, doAction, captureException) {
    let responseBody;
    try {
        responseBody = await magicLinkRes.clone().json();
    } catch {
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

export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    clearError(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const target = event.target;
    const email = target.querySelector('input[data-members-email]')?.value;
    const name = (target.querySelector('input[data-members-name]')?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = collectFormInputValues(target, 'input[data-members-label]', el => el.value);
    const newsletterInputs = Array.from(
        target.querySelectorAll(
            'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
        ) || []
    );
    const newsletters = buildNewsletterPayload(target, newsletterInputs);
    const urlHistory = getUrlHistory();

    const reqBody = buildRequestBody({email, emailType, labels, name, autoRedirect, newsletters, urlHistory, wantsOTC});

    setElementState(form, {add: ['loading']});

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, {...reqBody, integrityToken});

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});
            if (wantsOTC) {
                await handleOtcResponse(magicLinkRes, email, doAction, captureException);
            }
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            displayError(errorEl, chooseBestErrorMessage(e, t('Failed to send magic link email')));
            setElementState(form, {add: ['error']});
        }
    } catch (err) {
        setElementState(form, {add: ['error']});
        displayError(errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
    }
}

// ─── Plan Click Handler ───────────────────────────────────────────────────────

async function createStripeCheckoutSession(siteUrl, body) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
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
    const result = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (result.error) {
        throw new Error(result.error.message);
    }
}

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    clearError(errorEl);
    setElementState(el, {add: ['loading']});

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(null, el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(null, el.dataset.membersCancel);
    const urlHistory = getUrlHistory();
    const metadata = {
        ...(member ? {checkoutType: 'upgrade'} : {}),
        ...(urlHistory ? {urlHistory} : {})
    };

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
        handleElementError(el, clickHandler, errorEl, err);
    }
}

// ─── Edit Billing Handler ─────────────────────────────────────────────────────

async function createStripeUpdateSession(siteUrl, body) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

function makeEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementState(el, {add: ['loading']});

        try {
            const identity = await fetchMemberSession(siteUrl);
            const result = await createStripeUpdateSession(siteUrl, {identity, successUrl, cancelUrl});
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult.error) {
                throw new Error(t(redirectResult.error.message));
            }
        } catch (err) {
            handleElementError(el, clickHandler, errorEl, err);
        }
    }
    return clickHandler;
}

// ─── Manage Billing Handler ───────────────────────────────────────────────────

async function createStripeBillingPortalSession(siteUrl, body) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }
    return res.json();
}

function makeManageBillingClickHandler(el, errorEl, siteUrl, returnUrl) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementState(el, {add: ['loading']});

        try {
            const identity = await fetchMemberSession(siteUrl);
            const result = await createStripeBillingPortalSession(siteUrl, {identity, returnUrl});
            window.location.assign(result.url);
        } catch (err) {
            handleElementError(el, clickHandler, errorEl, err);
        }
    }
    return clickHandler;
}

// ─── Subscription Handlers ────────────────────────────────────────────────────

async function updateSubscription(siteUrl, subscriptionId, body) {
    const identity = await fetchMemberSession(siteUrl);
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, ...body})
    });
}

function makeCancelSubscriptionClickHandler(el, errorEl, siteUrl, hasRetentionOffers, doAction) {
    function clickHandler(event) {
        event.preventDefault();
        const subscriptionId = el.dataset.membersCancelSubscription;

        if (hasRetentionOffers) {
            doAction('openPopup', {page: 'accountPlan', pageData: {subscriptionId, action: 'cancel'}});
            return;
        }

        el.removeEventListener('click', clickHandler);
        clearError(errorEl);
        setElementState(el, {add: ['loading'], remove: ['error']});

        updateSubscription(siteUrl, subscriptionId, {smart_cancel: true}).then(res => {
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                setElementState(el, {add: ['error'], remove: ['loading']});
                displayError(errorEl, t('There was an error cancelling your subscription, please try again.'));
            }
        });
    }
    return clickHandler;
}

function makeContinueSubscriptionClickHandler(el, errorEl, siteUrl) {
    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementState(el, {add: ['loading'], remove: ['error']});

        const subscriptionId = el.dataset.membersContinueSubscription;

        updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false}).then(res => {
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                setElementState(el, {add: ['error'], remove: ['loading']});
                displayError(errorEl, t('There was an error continuing your subscription, please try again.'));
            }
        });
    }
    return clickHandler;
}

// ─── Sign Out Handler ─────────────────────────────────────────────────────────

function makeSignOutClickHandler(el, siteUrl) {
    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementState(el, {add: ['loading'], remove: ['error']});

        fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'}).then(res => {
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', clickHandler);
                setElementState(el, {add: ['error'], remove: ['loading']});
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
        const clickHandler = makeEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl);