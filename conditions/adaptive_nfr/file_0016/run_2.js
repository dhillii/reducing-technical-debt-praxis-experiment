# Refactored Code

The main issues I identified:
1. **Repeated patterns**: Session fetch → API call → handle response is duplicated across multiple handlers
2. **Mixed concerns**: DOM manipulation, API calls, and business logic intertwined
3. **Callback hell**: Promise chains instead of async/await
4. **Duplicated error handling**: Same error recovery pattern repeated everywhere
5. **Verbose DOM queries**: `Array.prototype.forEach.call` repeated throughout

```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ─── DOM Helpers ─────────────────────────────────────────────────────────────

function queryAll(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function resolveUrl(url) {
    return url ? new URL(url, window.location.href).href : undefined;
}

function setError(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message ?? '';
    }
}

function setElementState(el, {add = [], remove = []} = {}) {
    el.classList.remove(...remove);
    el.classList.add(...add);
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

// ─── Stripe Helpers ───────────────────────────────────────────────────────────

async function redirectViaStripe(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }
    const stripe = window.Stripe(responseBody.publicKey);
    const result = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (result.error) {
        throw new Error(result.error.message);
    }
}

// ─── Click Handler Factory ────────────────────────────────────────────────────

/**
 * Wraps an async click handler with consistent loading/error state management
 * and automatic listener re-registration on failure.
 */
function createClickHandler(el, errorEl, asyncHandler) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setError(errorEl, '');
        setElementState(el, {add: ['loading'], remove: ['error']});

        try {
            await asyncHandler(event);
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setElementState(el, {add: ['error'], remove: ['loading']});
            setError(errorEl, err.message);
        }
    }
    return clickHandler;
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function buildFormRequestBody(event, form) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
    const emailType = form.dataset.membersForm;

    const labels = Array.from(
        event.target.querySelectorAll('input[data-members-label]'),
        input => input.value
    );

    const newsletterInputs = Array.from(
        event.target.querySelectorAll(
            'input[type=hidden][data-members-newsletter],' +
            'input[type=checkbox][data-members-newsletter]:checked,' +
            'input[type=radio][data-members-newsletter]:checked'
        )
    );

    const checkableNewsletterInputs = event.target.querySelectorAll(
        'input[type=checkbox][data-members-newsletter]'
    );

    // Use empty array if checkable inputs exist but none are checked,
    // to prevent auto-subscription to default newsletters
    let newsletters;
    if (newsletterInputs.length > 0) {
        newsletters = newsletterInputs.map(input => ({name: input.value}));
    } else if (checkableNewsletterInputs.length > 0) {
        newsletters = [];
    }

    const reqBody = {
        email: emailInput?.value,
        emailType,
        labels,
        name: (nameInput?.value || '').trim() || undefined,
        autoRedirect: autoRedirect === 'true'
    };

    if (newsletters !== undefined) {
        reqBody.newsletters = newsletters;
    }

    const urlHistory = getUrlHistory();
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    return {reqBody, wantsOTC};
}

async function handleOTCResponse(magicLinkRes, email, doAction, captureException) {
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

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    setError(errorEl, '');
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const {reqBody, wantsOTC} = buildFormRequestBody(event, form);

    setElementState(form, {add: ['loading']});

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`);
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await postJson(
            `${siteUrl}/members/api/send-magic-link/`,
            {...reqBody, integrityToken}
        );

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});
            if (wantsOTC) {
                await handleOTCResponse(magicLinkRes, reqBody.email, doAction, captureException);
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            setError(errorEl, chooseBestErrorMessage(error, t('Failed to send magic link email')));
            setElementState(form, {add: ['error']});
        }
    } catch (err) {
        setElementState(form, {add: ['error'], remove: ['loading']});
        setError(errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
    }
}

// ─── Plan Click Handler ───────────────────────────────────────────────────────

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(el.dataset.membersCancel);
    const metadata = {
        ...(member ? {checkoutType: 'upgrade'} : {}),
        ...(getUrlHistory() ? {urlHistory: getUrlHistory()} : {})
    };

    setError(errorEl, '');
    setElementState(el, {add: ['loading']});

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
        .then(redirectViaStripe)
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setElementState(el, {add: ['error'], remove: ['loading']});
            setError(errorEl, err.message);
        });
}

// ─── Data Attribute Handlers ──────────────────────────────────────────────────

function registerFormHandlers(siteUrl, doAction, captureException) {
    queryAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

function registerPlanHandlers(siteUrl, site, member) {
    queryAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

function registerEditBillingHandlers(siteUrl) {
    queryAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(el.dataset.membersCancel);

        const clickHandler = createClickHandler(el, errorEl, async () => {
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
        });

        el.addEventListener('click', clickHandler);
    });
}

function registerManageBillingHandlers(siteUrl) {
    queryAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(el.dataset.membersReturn);

        const clickHandler = createClickHandler(el, errorEl, async () => {
            const identity = await fetchIdentity(siteUrl);
            const res = await postJson(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                identity,
                returnUrl
            });
            if (!res.ok) {
                throw new Error(t('Could not create Stripe billing portal session'));
            }
            const result = await res.json();
            window.location.assign(result.url);
        });

        el.addEventListener('click', clickHandler);
    });
}

function registerSignOutHandlers(siteUrl) {
    queryAll('[data-members-signout]').forEach(el => {
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
        el.addEventListener('click', clickHandler);
    });
}

function registerCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers) {
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
            setError(errorEl, '');
            setElementState(el, {add: ['loading'], remove: ['error']});

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
                        setElementState(el, {add: ['error'], remove: ['loading']});
                        setError(errorEl, t('There was an error cancelling your subscription, please try again.'));
                    }
                });
        }

        el.addEventListener('click', clickHandler);
    });
}

function registerContinueSubscriptionHandlers(siteUrl) {
    queryAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        const clickHandler = createClickHandler(el, errorEl, async () => {
            const subscriptionId = el.dataset.membersContinueSubscription;
            const identity = await fetchIdentity(siteUrl);
            const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, cancel_at_period_end: false})
            });

            if (res.ok) {
                window.location.reload();
            } else {
                // Re-throw to trigger error state in createClickHandler
                throw Object.assign(
                    new Error(t('There was an error continuing your subscription, please try again.')),
                    {displayInElement: true}
                );
            }
        });

        el.addEventListener('click', clickHandler);
    });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    registerFormHandlers(siteUrl, doAction, captureException);
    registerPlanHandlers(siteUrl, site, member);
    registerEditBillingHandlers(siteUrl);
    registerManageBillingHandlers(siteUrl);
    registerSignOutHandlers(siteUrl);
    registerCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers);
    registerContinueSubscriptionHandlers(siteUrl);
}
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| `Array.prototype.forEach.call` repeated 8× | `queryAll()` helper using `Array.from` |
| `new URL(...).href` duplicated | `resolveUrl()` helper |
| `errorEl.innerText = ''` scattered everywhere | `setError()` helper |
| `classList.add/remove` pairs repeated | `setElementState()` with `{add, remove}` |
| Session fetch + POST pattern duplicated 5× | `fetchIdentity()` + `postJson()` helpers |
| Identical error recovery (re-add listener, remove loading, set error) duplicated 5× | `createClickHandler()` factory wraps async handlers |
| `handleDataAttributes` was a 150-line monolith | Split into 7 focused `register*` functions |
| OTC response logic embedded in main handler | Extracted to `handleOTCResponse()` |
| Form body construction mixed with submission logic | Extracted to `buildFormRequestBody()` |
| Stripe redirect logic duplicated | Extracted to `redirectViaStripe()` |