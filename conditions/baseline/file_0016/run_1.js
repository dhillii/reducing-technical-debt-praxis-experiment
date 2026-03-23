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

function setLoadingState(el, isLoading) {
    el.classList.toggle('loading', isLoading);
}

function setErrorState(el, errorEl, message) {
    el.classList.remove('loading');
    el.classList.add('error');
    setElementText(errorEl, message);
}

function resolveUrl(base, path) {
    return path ? new URL(path, window.location.href).href : undefined;
}

function querySelectorAll(selector) {
    return Array.from(document.querySelectorAll(selector));
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

function withClickHandler(el, handler) {
    function clickHandler(event) {
        handler(event, clickHandler);
    }
    el.addEventListener('click', clickHandler);
}

function restoreClickHandler(el, clickHandler) {
    el.addEventListener('click', clickHandler);
    setLoadingState(el, false);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function collectFormData(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const labelInputs = event.target.querySelectorAll('input[data-members-label]');
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    );
    const checkableNewsletterInputs = event.target.querySelectorAll(
        'input[type=checkbox][data-members-newsletter]'
    );

    const labels = Array.from(labelInputs).map(i => i.value);
    const newsletters = Array.from(newsletterInputs).map(i => ({name: i.value}));

    let resolvedNewsletters;
    if (newsletterInputs.length > 0) {
        resolvedNewsletters = newsletters;
    } else if (checkableNewsletterInputs.length > 0) {
        resolvedNewsletters = [];
    }

    return {
        email: emailInput?.value,
        name: (nameInput?.value || '').trim() || undefined,
        labels,
        newsletters: resolvedNewsletters
    };
}

function buildRequestBody(form, formData, wantsOTC) {
    const autoRedirect = form?.dataset?.membersAutoredirect !== 'false';
    const urlHistory = getUrlHistory();

    const body = {
        email: formData.email,
        emailType: form.dataset.membersForm,
        labels: formData.labels,
        name: formData.name,
        autoRedirect
    };

    if (wantsOTC) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (formData.newsletters !== undefined) {
        body.newsletters = formData.newsletters;
    }

    return body;
}

async function sendMagicLink(siteUrl, reqBody) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    return postJson(`${siteUrl}/members/api/send-magic-link/`, {...reqBody, integrityToken});
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

export async function formSubmitHandler({
    event, form, errorEl, siteUrl, submitHandler, doAction, captureException
}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    clearError(errorEl);
    form.classList.remove('success', 'invalid', 'error');

    const formData = collectFormData(event);
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    const reqBody = buildRequestBody(form, formData, wantsOTC);

    setLoadingState(form, true);

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        setLoadingState(form, false);

        if (magicLinkRes.ok) {
            form.classList.add('success');
            if (wantsOTC) {
                await handleOtcResponse(magicLinkRes, formData.email, doAction, captureException);
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            setErrorState(form, errorEl, chooseBestErrorMessage(error, t('Failed to send magic link email')));
        }
    } catch (err) {
        setErrorState(form, errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
    }
}

// ─── Plan Click Handler ───────────────────────────────────────────────────────

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    clearError(errorEl);
    setLoadingState(el, true);

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(window.location.href, el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(window.location.href, el.dataset.membersCancel);

    const metadata = {
        ...(member ? {checkoutType: 'upgrade'} : {}),
        ...(getUrlHistory() ? {urlHistory: getUrlHistory()} : {})
    };

    try {
        const identity = await fetchSession(siteUrl);
        const res = await postJson(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
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
    } catch (err) {
        console.error(err);
        restoreClickHandler(el, clickHandler);
        setErrorState(el, errorEl, err.message);
    }
}

// ─── Stripe Session Handlers ──────────────────────────────────────────────────

async function handleStripeSessionClick({el, clickHandler, errorEl, siteUrl, apiEndpoint, body, onSuccess}) {
    el.removeEventListener('click', clickHandler);
    clearError(errorEl);
    setLoadingState(el, true);

    try {
        const identity = await fetchSession(siteUrl);
        const res = await postJson(`${siteUrl}${apiEndpoint}`, {...body, identity});

        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const result = await res.json();
        await onSuccess(result);
    } catch (err) {
        console.error(err);
        restoreClickHandler(el, clickHandler);
        setErrorState(el, errorEl, err.message);
    }
}

// ─── Subscription Handlers ────────────────────────────────────────────────────

async function updateSubscription(siteUrl, subscriptionId, body) {
    const identity = await fetchSession(siteUrl);
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
        withClickHandler(el, (event, clickHandler) => {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        });
    });

    // Edit billing
    querySelectorAll('[data-members-edit-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(window.location.href, el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(window.location.href, el.dataset.membersCancel);

        withClickHandler(el, async (event, clickHandler) => {
            event.preventDefault();
            await handleStripeSessionClick({
                el, clickHandler, errorEl, siteUrl,
                apiEndpoint: '/members/api/create-stripe-update-session/',
                body: {successUrl, cancelUrl},
                onSuccess: async (result) => {
                    const stripe = window.Stripe(result.publicKey);
                    const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
                    if (redirectResult?.error) {
                        throw new Error(t(redirectResult.error.message));
                    }
                }
            });
        });
    });

    // Manage billing (portal)
    querySelectorAll('[data-members-manage-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(window.location.href, el.dataset.membersReturn);

        withClickHandler(el, async (event, clickHandler) => {
            event.preventDefault();
            await handleStripeSessionClick({
                el, clickHandler, errorEl, siteUrl,
                apiEndpoint: '/members/api/create-stripe-billing-portal-session/',
                body: {returnUrl},
                onSuccess: async (result) => {
                    window.location.assign(result.url);
                }
            });
        });
    });

    // Sign out
    querySelectorAll('[data-members-signout]').forEach((el) => {
        withClickHandler(el, async (event, clickHandler) => {
            event.preventDefault();
            el.classList.remove('error');
            setLoadingState(el, true);

            const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                restoreClickHandler(el, clickHandler);
                el.classList.add('error');
            }
        });
    });

    // Cancel subscription
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    querySelectorAll('[data-members-cancel-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        withClickHandler(el, async (event, clickHandler) => {
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

            const res = await updateSubscription(siteUrl, subscriptionId, {smart_cancel: true});
            if (res.ok) {
                window.location.reload();
            } else {
                restoreClickHandler(el, clickHandler);
                el.classList.add('error');
                setElementText(errorEl, t('There was an error cancelling your subscription, please try again.'));
            }
        });
    });

    // Continue subscription
    querySelectorAll('[data-members-continue-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        withClickHandler(el, async (event, clickHandler) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            setLoadingState(el, true);
            clearError(errorEl);

            const subscriptionId = el.dataset.membersContinueSubscription;
            const res = await updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false});

            if (res.ok) {
                window.location.reload();
            } else {
                restoreClickHandler(el, clickHandler);
                el.classList.add('error');
                setElementText(errorEl, t('There was an error continuing your subscription, please try again.'));
            }
        });
    });
}
```

Key improvements made:

1. **Shared utilities**: Extracted `setElementText`, `clearError`, `setLoadingState`, `setErrorState`, `resolveUrl`, `querySelectorAll`, `fetchSession`, `postJson`, `withClickHandler`, and `restoreClickHandler` to eliminate repetition.

2. **Form logic decomposition**: Split `formSubmitHandler` into `collectFormData`, `buildRequestBody`, `sendMagicLink`, and `handleOtcResponse` for single-responsibility functions.

3. **Stripe session abstraction**: Created `handleStripeSessionClick` to unify the repeated pattern across edit-billing and manage-billing handlers.

4. **Subscription abstraction**: Extracted `updateSubscription` to share logic between cancel and continue handlers.

5. **Async/await throughout**: Replaced all `.then()` chains with async/await for readability.

6. **Consistent DOM querying**: Replaced `Array.prototype.forEach.call(document.querySelectorAll(...))` with a `querySelectorAll` helper returning `Array.from(...)`.