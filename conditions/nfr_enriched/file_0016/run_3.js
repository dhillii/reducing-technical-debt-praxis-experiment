Here's the refactored code with reduced complexity through extracted utilities, shared abstractions, and async/await patterns:

```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ─── Shared Utilities ────────────────────────────────────────────────────────

function setElementText(el, text) {
    if (el) {
        el.innerText = text;
    }
}

function clearError(errorEl) {
    setElementText(errorEl, '');
}

function setFormState(el, ...classes) {
    el.classList.remove('loading', 'success', 'invalid', 'error');
    classes.forEach(cls => el.classList.add(cls));
}

function resolveUrl(base, path) {
    return path ? new URL(path, window.location.href).href : undefined;
}

function querySelectorAll(selector) {
    return Array.from(document.querySelectorAll(selector));
}

async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

function handleElementError(el, errorEl, clickHandler, err) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setFormState(el, 'error');
    setElementText(errorEl, err.message);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function buildNewslettersPayload(target, newsletters) {
    if (newsletters.length > 0) {
        return newsletters;
    }
    const checkableInputs = target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return checkableInputs.length > 0 ? [] : undefined;
}

function buildRequestBody(form, event, newsletters) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labelInputs = event.target.querySelectorAll('input[data-members-label]');
    const labels = Array.from(labelInputs).map(input => input.value);

    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    );
    const newsletterValues = Array.from(newsletterInputs).map(input => ({name: input.value}));
    const resolvedNewsletters = buildNewslettersPayload(event.target, newsletterValues);

    const urlHistory = getUrlHistory();
    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        ...(wantsOTC && {includeOTC: true}),
        ...(urlHistory && {urlHistory}),
        ...(resolvedNewsletters !== undefined && {newsletters: resolvedNewsletters})
    };

    return {reqBody, email, wantsOTC};
}

async function handleOTCResponse(responseBody, email, doAction, captureException) {
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

    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    clearError(errorEl);
    setFormState(form, 'loading');

    const {reqBody, email, wantsOTC} = buildRequestBody(form, event, []);

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        setFormState(form);

        if (magicLinkRes.ok) {
            form.classList.add('success');

            if (wantsOTC) {
                let responseBody;
                try {
                    responseBody = await magicLinkRes.clone().json();
                } catch {
                    responseBody = undefined;
                }
                await handleOTCResponse(responseBody, email, doAction, captureException);
            }
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            setElementText(errorEl, chooseBestErrorMessage(e, t('Failed to send magic link email')));
            form.classList.add('error');
        }
    } catch (err) {
        form.classList.add('error');
        setElementText(errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
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

async function createStripeSession(siteUrl, endpoint, body) {
    const identity = await fetchIdentity(siteUrl);
    const res = await fetch(`${siteUrl}/members/api/${endpoint}/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...body, identity})
    });
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

// ─── Plan Click Handler ───────────────────────────────────────────────────────

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    clearError(errorEl);
    setFormState(el, 'loading');

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const urlHistory = getUrlHistory();
    const metadata = {
        ...(member && {checkoutType: 'upgrade'}),
        ...(urlHistory && {urlHistory})
    };

    try {
        const responseBody = await createStripeSession(siteUrl, 'create-stripe-checkout-session', {
            ...requestData,
            successUrl: resolveUrl(null, el.dataset.membersSuccess),
            cancelUrl: resolveUrl(null, el.dataset.membersCancel),
            metadata
        });
        await redirectToStripeCheckout(responseBody);
    } catch (err) {
        handleElementError(el, errorEl, clickHandler, err);
    }
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

// ─── handleDataAttributes ─────────────────────────────────────────────────────

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // Forms
    querySelectorAll('form[data-members-form]').forEach((form) => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    // Plan buttons
    querySelectorAll('[data-members-plan]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    querySelectorAll('[data-members-edit-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(null, el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(null, el.dataset.membersCancel);

        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            clearError(errorEl);
            setFormState(el, 'loading');

            try {
                const result = await createStripeSession(siteUrl, 'create-stripe-update-session', {
                    successUrl,
                    cancelUrl
                });
                const stripe = window.Stripe(result.publicKey);
                const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
                if (redirectResult?.error) {
                    throw new Error(t(redirectResult.error.message));
                }
            } catch (err) {
                handleElementError(el, errorEl, clickHandler, err);
            }
        }
        el.addEventListener('click', clickHandler);
    });

    // Manage billing (portal)
    querySelectorAll('[data-members-manage-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(null, el.dataset.membersReturn);

        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            clearError(errorEl);
            setFormState(el, 'loading');

            try {
                const identity = await fetchIdentity(siteUrl);
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
                handleElementError(el, errorEl, clickHandler, err);
            }
        }
        el.addEventListener('click', clickHandler);
    });

    // Sign out
    querySelectorAll('[data-members-signout]').forEach((el) => {
        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            setFormState(el, 'loading');

            const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', clickHandler);
                setFormState(el, 'error');
            }
        }
        el.addEventListener('click', clickHandler);
    });

    // Cancel subscription
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    querySelectorAll('[data-members-cancel-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        async function clickHandler(event) {
            event.preventDefault();
            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction('openPopup', {page: 'accountPlan', pageData: {subscriptionId, action: 'cancel'}});
                return;
            }

            el.removeEventListener('click', clickHandler);
            setFormState(el, 'loading');
            clearError(errorEl);

            const res = await updateSubscription(siteUrl, subscriptionId, {smart_cancel: true});
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                setFormState(el, 'error');
                setElementText(errorEl, t('There was an error cancelling your subscription, please try again.'));
            }
        }
        el.addEventListener('click', clickHandler);
    });

    // Continue subscription
    querySelectorAll('[data-members-continue-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            setFormState(el, 'loading');
            clearError(errorEl);

            const subscriptionId = el.dataset.membersContinueSubscription;
            const res = await updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false});

            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                setFormState(el, 'error');
                setElementText(errorEl, t('There was an error continuing your subscription, please try again.'));
            }
        }
        el.addEventListener('click', clickHandler);
    });
}
```

Key refactoring decisions:

1. **Shared utilities** — `setElementText`, `clearError`, `setFormState`, `resolveUrl`, `querySelectorAll`, `fetchIdentity`, and `handleElementError` eliminate repeated patterns throughout.

2. **Extracted async helpers** — `sendMagicLink`, `createStripeSession`, `redirectToStripeCheckout`, and `updateSubscription` isolate network logic and reduce nesting.

3. **Consistent async/await** — All `.then()` chains replaced with `async/await` for uniform, readable control flow.

4. **`buildRequestBody` / `buildNewslettersPayload`** — Decompose the dense form-parsing logic in `formSubmitHandler` into focused functions.

5. **Spread for conditional properties** — `...(condition && {key: value})` replaces repetitive `if` blocks when building objects.

6. **`Array.from` + `.forEach`** — Replaces `Array.prototype.forEach.call(...)` for cleaner iteration.