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

function setElementState(el, {add = [], remove = []} = {}) {
    remove.forEach(cls => el.classList.remove(cls));
    add.forEach(cls => el.classList.add(cls));
}

function resolveUrl(url, base = window.location.href) {
    return url ? new URL(url, base).href : undefined;
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
    setErrorMessage(errorEl, message instanceof Error ? message.message : message);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function collectFormInputValues(target, selector, mapper) {
    return Array.from(target.querySelectorAll(selector) || []).map(mapper);
}

function buildNewsletters(target) {
    const checkedSelector = [
        'input[type=hidden][data-members-newsletter]',
        'input[type=checkbox][data-members-newsletter]:checked',
        'input[type=radio][data-members-newsletter]:checked'
    ].join(', ');

    const checked = target.querySelectorAll(checkedSelector) || [];
    if (checked.length > 0) {
        return Array.from(checked).map(el => ({name: el.value}));
    }

    const checkable = target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkable.length > 0 ? [] : undefined;
}

function buildRequestBody(formData) {
    const {email, emailType, labels, name, autoRedirect, wantsOTC, newsletters, urlHistory} = formData;

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

async function parseOtcResponse(res) {
    try {
        return await res.clone().json();
    } catch {
        return undefined;
    }
}

async function handleOtcAction(responseBody, email, doAction, captureException) {
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

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    clearErrorMessage(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const target = event.target;
    const email = target.querySelector('input[data-members-email]')?.value;
    const name = (target.querySelector('input[data-members-name]')?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = collectFormInputValues(target, 'input[data-members-label]', el => el.value);
    const newsletters = buildNewsletters(target);
    const urlHistory = getUrlHistory();

    const reqBody = buildRequestBody({email, emailType, labels, name, autoRedirect, wantsOTC, newsletters, urlHistory});

    setElementState(form, {add: ['loading']});

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, {...reqBody, integrityToken});

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});
            if (wantsOTC) {
                const responseBody = await parseOtcResponse(magicLinkRes);
                await handleOtcAction(responseBody, email, doAction, captureException);
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            setErrorMessage(errorEl, chooseBestErrorMessage(error, t('Failed to send magic link email')));
            setElementState(form, {add: ['error']});
        }
    } catch (err) {
        setElementState(form, {add: ['error']});
        setErrorMessage(errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
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
    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(el.dataset.membersCancel);
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

function createEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearErrorMessage(errorEl);
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

function createManageBillingClickHandler(el, errorEl, siteUrl, returnUrl) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearErrorMessage(errorEl);
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

async function updateSubscription(siteUrl, subscriptionId, identity, body) {
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, ...body})
    });
}

function createCancelSubscriptionClickHandler(el, errorEl, siteUrl, hasRetentionOffers, doAction) {
    function clickHandler(event) {
        event.preventDefault();
        const subscriptionId = el.dataset.membersCancelSubscription;

        if (hasRetentionOffers) {
            doAction('openPopup', {page: 'accountPlan', pageData: {subscriptionId, action: 'cancel'}});
            return;
        }

        el.removeEventListener('click', clickHandler);
        clearErrorMessage(errorEl);
        setElementState(el, {add: ['loading'], remove: ['error']});

        fetchMemberSession(siteUrl)
            .then(identity => updateSubscription(siteUrl, subscriptionId, identity, {smart_cancel: true}))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {add: ['error'], remove: ['loading']});
                    setErrorMessage(errorEl, t('There was an error cancelling your subscription, please try again.'));
                }
            });
    }
    return clickHandler;
}

function createContinueSubscriptionClickHandler(el, errorEl, siteUrl) {
    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearErrorMessage(errorEl);
        setElementState(el, {add: ['loading'], remove: ['error']});

        const subscriptionId = el.dataset.membersContinueSubscription;

        fetchMemberSession(siteUrl)
            .then(identity => updateSubscription(siteUrl, subscriptionId, identity, {cancel_at_period_end: false}))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {add: ['error'], remove: ['loading']});
                    setErrorMessage(errorEl, t('There was an error continuing your subscription, please try again.'));
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
        const successUrl = resolveUrl(el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(el.dataset.membersCancel);
        const clickHandler = createEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl);
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-manage-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(el.dataset.membersReturn);
        const clickHandler = createManageBillingClickHandler(el, errorEl, siteUrl, returnUrl);
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data