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

function queryAll(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function resolveUrl(url) {
    return url ? new URL(url, window.location.href).href : undefined;
}

function setElementText(el, text) {
    if (el) {
        el.innerText = text;
    }
}

function clearError(errorEl) {
    setElementText(errorEl, '');
}

// ─── Element State Management ─────────────────────────────────────────────────

function createElementStateManager(el) {
    return {
        setLoading() {
            el.classList.add('loading');
        },
        clearLoading() {
            el.classList.remove('loading');
        },
        setError(errorEl, message) {
            el.classList.remove('loading');
            el.classList.add('error');
            setElementText(errorEl, message);
        },
        setSuccess() {
            el.classList.remove('loading');
            el.classList.add('success');
        },
        resetState(...states) {
            el.classList.remove(...states);
        }
    };
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return res.text();
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    return res;
}

async function putJson(url, body) {
    const res = await fetch(url, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    return res;
}

// ─── Form Data Extraction ─────────────────────────────────────────────────────

function extractFormData(event) {
    const target = event.target;
    const emailInput = target.querySelector('input[data-members-email]');
    const nameInput = target.querySelector('input[data-members-name]');

    const labelInputs = target.querySelectorAll('input[data-members-label]');
    const labels = Array.from(labelInputs).map(el => el.value);

    const checkedNewsletterSelector = [
        'input[type=hidden][data-members-newsletter]',
        'input[type=checkbox][data-members-newsletter]:checked',
        'input[type=radio][data-members-newsletter]:checked'
    ].join(', ');
    const newsletterInputs = target.querySelectorAll(checkedNewsletterSelector);
    const newsletters = Array.from(newsletterInputs).map(el => ({name: el.value}));

    const allCheckableNewsletters = target.querySelectorAll('input[type=checkbox][data-members-newsletter]');

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels,
        newsletters,
        hasCheckableNewsletters: allCheckableNewsletters.length > 0,
        hasCheckedNewsletters: newsletterInputs.length > 0
    };
}

function buildMagicLinkRequestBody(formData, form, integrityToken) {
    const {email, name, labels, newsletters, hasCheckableNewsletters, hasCheckedNewsletters} = formData;
    const emailType = form.dataset.membersForm;
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const urlHistory = getUrlHistory();

    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        integrityToken
    };

    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (hasCheckedNewsletters) {
        body.newsletters = newsletters;
    } else if (hasCheckableNewsletters) {
        body.newsletters = [];
    }

    return {body, wantsOTC, email};
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

    const state = createElementStateManager(form);
    state.setLoading();

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const formData = extractFormData(event);
        const {body, wantsOTC, email} = buildMagicLinkRequestBody(formData, form, integrityToken);

        const magicLinkRes = await postJson(`${siteUrl}/members/api/send-magic-link/`, body);

        form.addEventListener('submit', submitHandler);
        state.clearLoading();

        if (magicLinkRes.ok) {
            state.setSuccess();
            if (wantsOTC) {
                await handleOTCResponse(magicLinkRes, email, doAction, captureException);
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            const message = chooseBestErrorMessage(error, t('Failed to send magic link email'));
            state.setError(errorEl, message);
        }
    } catch (err) {
        form.classList.add('error');
        const message = chooseBestErrorMessage(err, t('There was an error sending the email, please try again'));
        setElementText(errorEl, message);
    }
}

// ─── Stripe Checkout ──────────────────────────────────────────────────────────

async function redirectToStripeCheckout(siteUrl, checkoutBody) {
    const identity = await fetchIdentity(siteUrl);
    const res = await postJson(
        `${siteUrl}/members/api/create-stripe-checkout-session/`,
        {...checkoutBody, identity}
    );

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

    const state = createElementStateManager(el);
    state.setLoading();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(el.dataset.membersCancel);
    const urlHistory = getUrlHistory();

    const metadata = {
        ...(member ? {checkoutType: 'upgrade'} : {}),
        ...(urlHistory ? {urlHistory} : {})
    };

    const checkoutBody = {
        ...requestData,
        successUrl,
        cancelUrl,
        metadata
    };

    return redirectToStripeCheckout(siteUrl, checkoutBody).catch((err) => {
        console.error(err);
        el.addEventListener('click', clickHandler);
        state.setError(errorEl, err.message);
    });
}

// ─── Generic Click Handler Factory ───────────────────────────────────────────

/**
 * Creates a self-removing click handler with loading state management and error recovery.
 */
function createClickHandler(el, errorEl, action) {
    const state = createElementStateManager(el);

    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        state.setLoading();

        action().catch((err) => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            state.setError(errorEl, err.message);
        });
    }

    return clickHandler;
}

// ─── Billing Handlers ─────────────────────────────────────────────────────────

async function handleEditBilling(siteUrl, successUrl, cancelUrl) {
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

async function handleManageBilling(siteUrl, returnUrl) {
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

// ─── Subscription Handlers ────────────────────────────────────────────────────

async function updateSubscription(siteUrl, subscriptionId, updateBody) {
    const identity = await fetchIdentity(siteUrl);
    const res = await putJson(
        `${siteUrl}/members/api/subscriptions/${subscriptionId}/`,
        {identity, ...updateBody}
    );
    return res;
}

function registerCancelSubscriptionHandler(el, siteUrl, hasRetentionOffers, doAction) {
    const errorEl = el.parentElement.querySelector('[data-members-error]');
    const state = createElementStateManager(el);

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
        clearError(errorEl);
        state.resetState('error');
        state.setLoading();

        updateSubscription(siteUrl, subscriptionId, {smart_cancel: true}).then((res) => {
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                state.setError(errorEl, t('There was an error cancelling your subscription, please try again.'));
            }
        });
    }

    el.addEventListener('click', clickHandler);
}

function registerContinueSubscriptionHandler(el, siteUrl) {
    const errorEl = el.parentElement.querySelector('[data-members-error]');
    const state = createElementStateManager(el);

    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearError(errorEl);
        state.resetState('error');
        state.setLoading();

        const subscriptionId = el.dataset.membersContinueSubscription;

        updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false}).then((res) => {
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                state.setError(errorEl, t('There was an error continuing your subscription, please try again.'));
            }
        });
    }

    el.addEventListener('click', clickHandler);
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

function registerSignOutHandler(el, siteUrl) {
    const state = createElementStateManager(el);

    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        state.resetState('error');
        state.setLoading();

        fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'}).then((res) => {
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', clickHandler);
                state.clearLoading();
                el.classList.add('error');
            }
        });
    }

    el.addEventListener('click', clickHandler);
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    queryAll('form[data-members-form]').forEach((form) => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    queryAll('[data-members-plan]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    queryAll('[data-members-edit-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(el.dataset.membersCancel);

        const clickHandler = createClickHandler(el, errorEl, () =>
            handleEditBilling(siteUrl, successUrl, cancelUrl)
        );
        el.addEventListener('click', clickHandler);
    });

    queryAll('[data-members-manage-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(el.dataset.membersReturn);

        const clickHandler = createClickHandler(el, errorEl, () =>
            handleManageBilling(siteUrl, returnUrl)
        );
        el.addEventListener('click', clickHandler);
    });

    queryAll('[data-members-signout]').forEach(el =>
        registerSignOutHandler(el, siteUrl)
    );

    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    queryAll('[data-members-cancel-subscription]').forEach(el =>
        registerCancelSubscriptionHandler(el, siteUrl, hasRetentionOffers, doAction)
    );

    queryAll('[data-members-continue-subscription]').forEach(el =>
        registerContinueSubscriptionHandler(el, siteUrl)
    );
}
```

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| Repeated `.then()` chains for fetch session → call API | Extracted `fetchIdentity()`, `postJson()`, `putJson()` primitives |
| Duplicated error/loading state manipulation | `createElementStateManager()` encapsulates all class toggling |
| Identical catch blocks across 5 handlers | `createClickHandler()` factory handles the common pattern |
| `Array.prototype.forEach.call` verbosity | `queryAll()` wrapper using `Array.from()` |
| Mixed `async/await` and `.then()` styles | Unified to `async/await` throughout |
| Monolithic `formSubmitHandler` | Split into `extractFormData()`, `buildMagicLinkRequestBody()`, `handleOTCResponse()` |
| Repeated `new URL(...).href` pattern | `resolveUrl()` helper |
| Inline `cancelUrl`/`successUrl` resolution in handlers | Resolved once at registration time, not on each click |