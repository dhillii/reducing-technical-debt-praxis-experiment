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

function setFormState(el, ...classNames) {
    el.classList.remove('loading', 'success', 'invalid', 'error');
    classNames.forEach(cls => el.classList.add(cls));
}

function resolveUrl(base, path) {
    return path ? new URL(path, window.location.href).href : undefined;
}

function queryAll(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

async function fetchSession(siteUrl) {
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

function handleElementError(el, errorEl, clickHandler, err) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setFormState(el, 'error');
    setElementText(errorEl, err.message);
}

function withLoadingElement(el, clickHandler, errorEl, asyncFn) {
    el.removeEventListener('click', clickHandler);
    setFormState(el, 'loading');
    clearError(errorEl);

    return asyncFn().catch(err => handleElementError(el, errorEl, clickHandler, err));
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function collectFormData(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');

    const labelInputs = event.target.querySelectorAll('input[data-members-label]');
    const labels = Array.from(labelInputs).map(i => i.value);

    const newsletterSelector = [
        'input[type=hidden][data-members-newsletter]',
        'input[type=checkbox][data-members-newsletter]:checked',
        'input[type=radio][data-members-newsletter]:checked'
    ].join(', ');

    const newsletterInputs = event.target.querySelectorAll(newsletterSelector);
    const newsletters = Array.from(newsletterInputs).map(i => ({name: i.value}));

    const checkableNewsletterInputs = event.target.querySelectorAll(
        'input[type=checkbox][data-members-newsletter]'
    );

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels,
        newsletters,
        hasCheckableNewsletters: checkableNewsletterInputs.length > 0,
        hasCheckedNewsletters: newsletterInputs.length > 0
    };
}

function buildRequestBody(formData, emailType, autoRedirect, wantsOTC) {
    const {email, name, labels, newsletters, hasCheckableNewsletters, hasCheckedNewsletters} = formData;
    const urlHistory = getUrlHistory();

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        ...(wantsOTC && {includeOTC: true}),
        ...(urlHistory && {urlHistory})
    };

    if (hasCheckedNewsletters) {
        reqBody.newsletters = newsletters;
    } else if (hasCheckableNewsletters) {
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
    setFormState(form, 'loading');

    const emailType = form.dataset.membersForm;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const formData = collectFormData(event);
    const reqBody = buildRequestBody(formData, emailType, autoRedirect, wantsOTC);

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            setFormState(form, 'success');

            if (wantsOTC) {
                let responseBody;
                try {
                    responseBody = await magicLinkRes.clone().json();
                } catch {
                    responseBody = undefined;
                }
                await handleOtcResponse(responseBody, formData.email, doAction, captureException);
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            setElementText(errorEl, chooseBestErrorMessage(error, t('Failed to send magic link email')));
            setFormState(form, 'error');
        }
    } catch (err) {
        setFormState(form, 'error');
        setElementText(errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
    }
}

// ─── Plan Click Handler ───────────────────────────────────────────────────────

async function redirectToStripeCheckout(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    const res = await postJson(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        ...requestData,
        identity,
        successUrl: checkoutSuccessUrl,
        cancelUrl: checkoutCancelUrl,
        metadata
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
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = resolveUrl(window.location.href, el.dataset.membersSuccess);
    const checkoutCancelUrl = resolveUrl(window.location.href, el.dataset.membersCancel);
    const urlHistory = getUrlHistory();

    const metadata = {
        ...(member && {checkoutType: 'upgrade'}),
        ...(urlHistory && {urlHistory})
    };

    return withLoadingElement(el, clickHandler, errorEl, async () => {
        const identity = await fetchSession(siteUrl);
        await redirectToStripeCheckout(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
    });
}

// ─── Data Attribute Handlers ──────────────────────────────────────────────────

function registerFormHandlers(siteUrl, doAction, captureException) {
    queryAll('form[data-members-form]').forEach((form) => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

function registerPlanHandlers(siteUrl, site, member) {
    queryAll('[data-members-plan]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

function registerEditBillingHandlers(siteUrl) {
    queryAll('[data-members-edit-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(window.location.href, el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(window.location.href, el.dataset.membersCancel);

        async function clickHandler(event) {
            event.preventDefault();
            return withLoadingElement(el, clickHandler, errorEl, async () => {
                const identity = await fetchSession(siteUrl);
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
        }

        el.addEventListener('click', clickHandler);
    });
}

function registerManageBillingHandlers(siteUrl) {
    queryAll('[data-members-manage-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(window.location.href, el.dataset.membersReturn);

        async function clickHandler(event) {
            event.preventDefault();
            return withLoadingElement(el, clickHandler, errorEl, async () => {
                const identity = await fetchSession(siteUrl);
                const res = await postJson(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    identity,
                    returnUrl
                });

                if (!res.ok) {
                    throw new Error(t('Could not create Stripe billing portal session'));
                }

                const result = await res.json();
                return window.location.assign(result.url);
            });
        }

        el.addEventListener('click', clickHandler);
    });
}

function registerSignOutHandlers(siteUrl) {
    queryAll('[data-members-signout]').forEach((el) => {
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
}

function registerCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers) {
    queryAll('[data-members-cancel-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        async function clickHandler(event) {
            event.preventDefault();
            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction('openPopup', {page: 'accountPlan', pageData: {subscriptionId, action: 'cancel'}});
                return;
            }

            return withLoadingElement(el, clickHandler, errorEl, async () => {
                const identity = await fetchSession(siteUrl);
                const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, smart_cancel: true})
                });

                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setFormState(el, 'error');
                    setElementText(errorEl, t('There was an error cancelling your subscription, please try again.'));
                }
            });
        }

        el.addEventListener('click', clickHandler);
    });
}

function registerContinueSubscriptionHandlers(siteUrl) {
    queryAll('[data-members-continue-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        async function clickHandler(event) {
            event.preventDefault();
            const subscriptionId = el.dataset.membersContinueSubscription;

            return withLoadingElement(el, clickHandler, errorEl, async () => {
                const identity = await fetchSession(siteUrl);
                const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, cancel_at_period_end: false})
                });

                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setFormState(el, 'error');
                    setElementText(errorEl, t('There was an error continuing your subscription, please try again.'));
                }
            });
        }

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

Key refactoring decisions:

1. **Shared utilities** — `setElementText`, `clearError`, `setFormState`, `resolveUrl`, `queryAll`, `fetchSession`, `postJson` eliminate repeated patterns throughout the code.

2. **`withLoadingElement`** — Encapsulates the repetitive pattern of removing a listener, setting loading state, clearing errors, and catching errors across all click handlers.

3. **`collectFormData` / `buildRequestBody`** — Break `formSubmitHandler` into focused, testable units instead of one large function.

4. **`registerXxxHandlers`** — Each handler type gets its own registration function, making `handleDataAttributes` a clean orchestrator rather than a monolithic block.

5. **Async/await throughout** — Replaces all `.then()` chains for improved readability and consistent error handling.

6. **Spread for conditional properties** — Replaces imperative `if` blocks when building objects (e.g., `metadata`, `reqBody`).