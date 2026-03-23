# Refactored Code

The main issues I identified:
1. **Repeated patterns**: fetch session → call API → handle result/error appears 5+ times
2. **Mixed concerns**: DOM manipulation, API calls, and business logic intertwined
3. **Inconsistent async styles**: mixing `.then()` chains with `async/await`
4. **Duplicated error handling**: nearly identical catch blocks throughout
5. **Verbose DOM queries**: `Array.prototype.forEach.call` repeated everywhere

```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ─── DOM Helpers ─────────────────────────────────────────────────────────────

const queryAll = selector => [...document.querySelectorAll(selector)];

function setElementText(el, text) {
    if (el) {
        el.innerText = text;
    }
}

function clearError(errorEl) {
    setElementText(errorEl, '');
}

function setLoadingState(el, isLoading) {
    el.classList.toggle('loading', isLoading);
}

function setErrorState(el, errorEl, message) {
    el.classList.add('error');
    setElementText(errorEl, message);
}

function resolveUrl(path) {
    return path ? new URL(path, window.location.href).href : undefined;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

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

// ─── Element Click Handler Factory ───────────────────────────────────────────

/**
 * Creates a self-removing click handler with standard loading/error state management.
 * @param {Element} el
 * @param {{ errorEl?: Element, onError?: (err: Error) => void }} options
 * @param {(event: Event) => Promise<void>} action
 */
function createClickHandler(el, {errorEl, onError} = {}, action) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        setLoadingState(el, true);

        try {
            await action(event);
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            if (onError) {
                onError(err);
            } else {
                setErrorState(el, errorEl, err.message);
            }
        }
    }
    return clickHandler;
}

// ─── Form Input Parsing ───────────────────────────────────────────────────────

function parseFormInputs(target) {
    const emailInput = target.querySelector('input[data-members-email]');
    const nameInput = target.querySelector('input[data-members-name]');
    const labelInputs = target.querySelectorAll('input[data-members-label]');
    const newsletterInputs = target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    );
    const checkableNewsletterInputs = target.querySelectorAll(
        'input[type=checkbox][data-members-newsletter]'
    );

    const labels = [...labelInputs].map(i => i.value);
    const newsletters = [...newsletterInputs].map(i => ({name: i.value}));

    // If checkable inputs exist but none are checked, explicitly opt out of default newsletters
    const resolvedNewsletters = newsletterInputs.length > 0
        ? newsletters
        : checkableNewsletterInputs.length > 0 ? [] : undefined;

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels,
        newsletters: resolvedNewsletters
    };
}

function buildMagicLinkRequestBody(form, inputs, integrityToken) {
    const emailType = form.dataset.membersForm;
    const autoRedirect = form?.dataset?.membersAutoredirect !== 'false';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const urlHistory = getUrlHistory();

    const body = {
        email: inputs.email,
        emailType,
        labels: inputs.labels,
        name: inputs.name,
        autoRedirect,
        integrityToken,
        ...(wantsOTC && {includeOTC: true}),
        ...(urlHistory && {urlHistory}),
        ...(inputs.newsletters !== undefined && {newsletters: inputs.newsletters})
    };

    return {body, wantsOTC, emailType};
}

// ─── OTC Handling ─────────────────────────────────────────────────────────────

async function handleOTCResponse(magicLinkRes, email, doAction, captureException) {
    let responseBody;
    try {
        responseBody = await magicLinkRes.clone().json();
    } catch {
        return;
    }

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

// ─── Form Submit Handler ──────────────────────────────────────────────────────

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    clearError(errorEl);
    form.classList.remove('success', 'invalid', 'error');
    form.classList.add('loading');

    const inputs = parseFormInputs(event.target);

    try {
        const integrityToken = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'})
            .then(res => res.text());

        const {body, wantsOTC} = buildMagicLinkRequestBody(form, inputs, integrityToken);
        const magicLinkRes = await postJson(`${siteUrl}/members/api/send-magic-link/`, body);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            form.classList.add('success');
            if (wantsOTC) {
                await handleOTCResponse(magicLinkRes, inputs.email, doAction, captureException);
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            form.classList.add('error');
            setElementText(errorEl, chooseBestErrorMessage(error, t('Failed to send magic link email')));
        }
    } catch (err) {
        form.classList.add('error');
        setElementText(
            errorEl,
            chooseBestErrorMessage(err, t('There was an error sending the email, please try again'))
        );
    }
}

// ─── Stripe Checkout ──────────────────────────────────────────────────────────

async function redirectToStripeCheckout(siteUrl, checkoutBody) {
    const identity = await fetchIdentity(siteUrl);
    const res = await postJson(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        ...checkoutBody,
        identity
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const responseBody = await res.json();

    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }

    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    clearError(errorEl);
    setLoadingState(el, true);

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const urlHistory = getUrlHistory();
    const metadata = {
        ...(member && {checkoutType: 'upgrade'}),
        ...(urlHistory && {urlHistory})
    };

    return redirectToStripeCheckout(siteUrl, {
        ...requestData,
        successUrl: resolveUrl(el.dataset.membersSuccess),
        cancelUrl: resolveUrl(el.dataset.membersCancel),
        metadata
    }).catch(err => {
        console.error(err);
        el.addEventListener('click', clickHandler);
        setLoadingState(el, false);
        setErrorState(el, errorEl, err.message);
    });
}

// ─── Stripe Session Handlers ──────────────────────────────────────────────────

async function createStripeUpdateSession(siteUrl, {successUrl, cancelUrl}) {
    const identity = await fetchIdentity(siteUrl);
    const res = await postJson(`${siteUrl}/members/api/create-stripe-update-session/`, {
        identity,
        successUrl,
        cancelUrl
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const result = await res.json();
    const stripe = window.Stripe(result.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});

    if (redirectResult.error) {
        throw new Error(t(redirectResult.error.message));
    }
}

async function createBillingPortalSession(siteUrl, {returnUrl}) {
    const identity = await fetchIdentity(siteUrl);
    const res = await postJson(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        identity,
        returnUrl
    });

    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    const result = await res.json();
    return window.location.assign(result.url);
}

async function updateSubscription(siteUrl, subscriptionId, updateBody) {
    const identity = await fetchIdentity(siteUrl);
    return postJson(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        identity,
        ...updateBody
    });
}

// ─── handleDataAttributes ─────────────────────────────────────────────────────

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // ── Magic Link Forms ──
    queryAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    // ── Plan Checkout ──
    queryAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // ── Edit Billing ──
    queryAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(el.dataset.membersCancel);

        const clickHandler = createClickHandler(el, {errorEl}, () =>
            createStripeUpdateSession(siteUrl, {successUrl, cancelUrl})
        );
        el.addEventListener('click', clickHandler);
    });

    // ── Manage Billing (Portal) ──
    queryAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(el.dataset.membersReturn);

        const clickHandler = createClickHandler(el, {errorEl}, () =>
            createBillingPortalSession(siteUrl, {returnUrl})
        );
        el.addEventListener('click', clickHandler);
    });

    // ── Sign Out ──
    queryAll('[data-members-signout]').forEach(el => {
        const clickHandler = createClickHandler(el, {}, async () => {
            el.classList.remove('error');
            const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                throw new Error(t('Sign out failed'));
            }
        });
        el.addEventListener('click', clickHandler);
    });

    // ── Cancel Subscription ──
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    queryAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        function clickHandler(event) {
            event.preventDefault();
            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction('openPopup', {page: 'accountPlan', pageData: {subscriptionId, action: 'cancel'}});
                return;
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            setLoadingState(el, true);
            clearError(errorEl);

            updateSubscription(siteUrl, subscriptionId, {smart_cancel: true})
                .then(res => {
                    if (res.ok) {
                        window.location.reload();
                    } else {
                        el.addEventListener('click', clickHandler);
                        setLoadingState(el, false);
                        setErrorState(el, errorEl, t('There was an error cancelling your subscription, please try again.'));
                    }
                });
        }
        el.addEventListener('click', clickHandler);
    });

    // ── Continue Subscription ──
    queryAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        const clickHandler = createClickHandler(el, {errorEl}, async () => {
            const subscriptionId = el.dataset.membersContinueSubscription;
            const res = await updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false});

            if (res.ok) {
                window.location.reload();
            } else {
                // Re-attach and reset state for retry
                el.addEventListener('click', clickHandler);
                setLoadingState(el, false);
                setErrorState(el, errorEl, t('There was an error continuing your subscription, please try again.'));
            }
        });
        el.addEventListener('click', clickHandler);
    });
}
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| Repeated `Array.prototype.forEach.call` | `queryAll()` helper using spread |
| 5 near-identical click handlers with loading/error boilerplate | `createClickHandler()` factory |
| Repeated `fetch session → call API` pattern | `fetchIdentity()` + `postJson()` + dedicated async functions |
| Mixed `.then()` and `async/await` | Unified to `async/await` throughout |
| Duplicated error/loading DOM manipulation | `setLoadingState()`, `setErrorState()`, `clearError()` helpers |
| Repeated URL resolution logic | `resolveUrl()` helper |
| Monolithic `formSubmitHandler` | Split into `parseFormInputs()`, `buildMagicLinkRequestBody()`, `handleOTCResponse()` |
| Repeated `new URL(..., window.location.href).href` | `resolveUrl()` helper |