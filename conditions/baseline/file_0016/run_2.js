# Refactored Code

The main improvements focus on:
1. Extracting shared utilities to eliminate repetition
2. Converting promise chains to async/await
3. Reducing nesting depth
4. Grouping related logic into cohesive helpers

```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ─── Shared Utilities ────────────────────────────────────────────────────────

function displayError(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function clearError(errorEl) {
    displayError(errorEl, '');
}

function setElementState(el, {add = [], remove = []} = {}) {
    remove.forEach(cls => el.classList.remove(cls));
    add.forEach(cls => el.classList.add(cls));
}

function resolveUrl(path) {
    return path ? new URL(path, window.location.href).href : undefined;
}

async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

function handleElementError(el, clickHandler, errorEl, message) {
    console.error(message);
    el.addEventListener('click', clickHandler);
    setElementState(el, {add: ['error'], remove: ['loading']});
    displayError(errorEl, message instanceof Error ? message.message : message);
}

function forEachElement(selector, callback) {
    document.querySelectorAll(selector).forEach(callback);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function buildNewsletterPayload(target, newsletters) {
    if (newsletters.length > 0) {
        return newsletters;
    }
    const checkableInputs = target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return checkableInputs.length > 0 ? [] : undefined;
}

function collectFormData(event) {
    const target = event.target;

    const labels = [...target.querySelectorAll('input[data-members-label]')]
        .map(input => input.value);

    const newsletters = [
        ...target.querySelectorAll([
            'input[type=hidden][data-members-newsletter]',
            'input[type=checkbox][data-members-newsletter]:checked',
            'input[type=radio][data-members-newsletter]:checked'
        ].join(', '))
    ].map(input => ({name: input.value}));

    return {
        email: target.querySelector('input[data-members-email]')?.value,
        name: (target.querySelector('input[data-members-name]')?.value || '').trim() || undefined,
        labels,
        newsletters,
        newsletterPayload: buildNewsletterPayload(target, newsletters)
    };
}

async function fetchMagicLink(siteUrl, reqBody) {
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
    } catch {
        return;
    }

    const {otc_ref: otcRef, inboxLinks} = responseBody ?? {};
    if (!otcRef || typeof doAction !== 'function') {
        return;
    }

    try {
        doAction('startSigninOTCFromCustomForm', {
            email: (email || '').trim(),
            otcRef,
            inboxLinks
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

    clearError(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const {email, name, labels, newsletterPayload} = collectFormData(event);
    const emailType = form.dataset.membersForm;
    const autoRedirect = (form?.dataset?.membersAutoredirect ?? 'true') === 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        ...(wantsOTC && {includeOTC: true}),
        ...(getUrlHistory() && {urlHistory: getUrlHistory()}),
        ...(newsletterPayload !== undefined && {newsletters: newsletterPayload})
    };

    setElementState(form, {add: ['loading']});

    try {
        const magicLinkRes = await fetchMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});
            if (wantsOTC) {
                await handleOtcResponse(magicLinkRes, email, doAction, captureException);
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

// ─── Plan Click Handler ───────────────────────────────────────────────────────

async function redirectToStripeCheckout(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...requestData, identity, successUrl, cancelUrl, metadata})
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const body = await res.json();

    if (body.url) {
        return window.location.assign(body.url);
    }

    const result = await window.Stripe(body.publicKey).redirectToCheckout({sessionId: body.sessionId});
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
    const successUrl = resolveUrl(el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(el.dataset.membersCancel);
    const urlHistory = getUrlHistory();
    const metadata = {
        ...(member && {checkoutType: 'upgrade'}),
        ...(urlHistory && {urlHistory})
    };

    try {
        const identity = await fetchIdentity(siteUrl);
        await redirectToStripeCheckout(siteUrl, requestData, identity, successUrl, cancelUrl, metadata);
    } catch (err) {
        handleElementError(el, clickHandler, errorEl, err);
    }
}

// ─── Billing Handlers ─────────────────────────────────────────────────────────

async function createStripeSession(siteUrl, endpoint, body) {
    const res = await fetch(`${siteUrl}${endpoint}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

function registerEditBillingHandler(el, siteUrl) {
    const errorEl = el.querySelector('[data-members-error]');
    const successUrl = resolveUrl(el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(el.dataset.membersCancel);

    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementState(el, {add: ['loading']});

        try {
            const identity = await fetchIdentity(siteUrl);
            const result = await createStripeSession(
                siteUrl,
                '/members/api/create-stripe-update-session/',
                {identity, successUrl, cancelUrl}
            );
            const stripeResult = await window.Stripe(result.publicKey).redirectToCheckout({sessionId: result.sessionId});
            if (stripeResult.error) {
                throw new Error(t(stripeResult.error.message));
            }
        } catch (err) {
            handleElementError(el, clickHandler, errorEl, err);
        }
    }

    el.addEventListener('click', clickHandler);
}

function registerManageBillingHandler(el, siteUrl) {
    const errorEl = el.querySelector('[data-members-error]');
    const returnUrl = resolveUrl(el.dataset.membersReturn);

    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setElementState(el, {add: ['loading']});

        try {
            const identity = await fetchIdentity(siteUrl);
            const result = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, returnUrl})
            });

            if (!result.ok) {
                throw new Error(t('Could not create Stripe billing portal session'));
            }

            const {url} = await result.json();
            window.location.assign(url);
        } catch (err) {
            handleElementError(el, clickHandler, errorEl, err);
        }
    }

    el.addEventListener('click', clickHandler);
}

// ─── Subscription Handlers ────────────────────────────────────────────────────

async function updateSubscription(siteUrl, subscriptionId, body) {
    const identity = await fetchIdentity(siteUrl);
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, ...body})
    });
}

function registerCancelSubscriptionHandler(el, siteUrl, hasRetentionOffers, doAction) {
    const errorEl = el.parentElement.querySelector('[data-members-error]');

    async function clickHandler(event) {
        event.preventDefault();
        const subscriptionId = el.dataset.membersCancelSubscription;

        if (hasRetentionOffers) {
            doAction('openPopup', {page: 'accountPlan', pageData: {subscriptionId, action: 'cancel'}});
            return;
        }

        el.removeEventListener('click', clickHandler);
        setElementState(el, {add: ['loading'], remove: ['error']});
        clearError(errorEl);

        const res = await updateSubscription(siteUrl, subscriptionId, {smart_cancel: true});

        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            setElementState(el, {add: ['error'], remove: ['loading']});
            displayError(errorEl, t('There was an error cancelling your subscription, please try again.'));
        }
    }

    el.addEventListener('click', clickHandler);
}

function registerContinueSubscriptionHandler(el, siteUrl) {
    const errorEl = el.parentElement.querySelector('[data-members-error]');

    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementState(el, {add: ['loading'], remove: ['error']});
        clearError(errorEl);

        const subscriptionId = el.dataset.membersContinueSubscription;
        const res = await updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false});

        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            setElementState(el, {add: ['error'], remove: ['loading']});
            displayError(errorEl, t('There was an error continuing your subscription, please try again.'));
        }
    }

    el.addEventListener('click', clickHandler);
}

function registerSignOutHandler(el, siteUrl) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setElementState(el, {add: ['loading'], remove: ['error']});

        const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});

        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', clickHandler);
            setElementState(el, {add: ['error'], remove: ['loading']});
        }
    }

    el.addEventListener('click', clickHandler);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

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
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-edit-billing]', el => registerEditBillingHandler(el, siteUrl));
    forEachElement('[data-members-manage-billing]', el => registerManageBillingHandler(el, siteUrl));
    forEachElement('[data-members-signout]', el => registerSignOutHandler(el, siteUrl));
    forEachElement('[data-members-cancel-subscription]', el => registerCancelSubscriptionHandler(el, siteUrl, hasRetentionOffers, doAction));
    forEachElement('[data-members-continue-subscription]', el => registerContinueSubscriptionHandler(el, siteUrl));
}
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| Repeated `classList.add/remove` calls | `setElementState()` utility accepting `{add, remove}` arrays |
| Repeated `errorEl.innerText = ''` | `clearError()` / `displayError()` helpers |
| Repeated `new URL(...).href` pattern | `resolveUrl()` helper |
| Repeated `fetch session` + identity logic | `fetchIdentity()` helper |
| Repeated error recovery pattern | `handleElementError()` helper |
| `Array.prototype.forEach.call(querySelectorAll(...))` | `forEachElement()` helper |
| Deeply nested `.then()` chains | Converted to `async/await` throughout |
| Monolithic `handleDataAttributes` | Extracted per-element registration functions |
| Inline OTC logic inside form handler | Extracted `handleOtcResponse()` |
| Inline form data collection | Extracted `collectFormData()` |
| Repeated Stripe checkout fetch logic | Extracted `redirectToStripeCheckout()` and `createStripeSession()` |