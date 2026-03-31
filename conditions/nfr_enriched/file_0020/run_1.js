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

function resolveUrl(base, relative) {
    if (!relative) {
        return undefined;
    }
    return new URL(relative, window.location.href).href;
}

function forEachElement(selector, callback) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), callback);
}

function withReattach(el, eventType, handler) {
    return {
        detach: () => el.removeEventListener(eventType, handler),
        reattach: () => el.addEventListener(eventType, handler)
    };
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(options.errorMessage || t('Request failed'));
    }
    return res.json();
}

function handleElementError(el, errorEl, clickHandler, err) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setElementState(el, {add: ['error'], remove: ['loading']});
    setErrorMessage(errorEl, err.message);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function collectFormInputValues(target, selector, mapper) {
    return Array.from(target.querySelectorAll(selector) || []).map(mapper);
}

function buildNewslettersPayload(target, newsletterInputs) {
    if (newsletterInputs.length > 0) {
        return newsletterInputs.map(input => ({name: input.value}));
    }

    const checkableInputs = target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkableInputs.length > 0 ? [] : undefined;
}

function buildMagicLinkRequestBody(params) {
    const {email, emailType, labels, name, autoRedirect, newsletters, urlHistory, wantsOTC} = params;

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

async function sendMagicLink(siteUrl, reqBody) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
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

    clearErrorMessage(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const target = event.target;
    const email = target.querySelector('input[data-members-email]')?.value;
    const name = (target.querySelector('input[data-members-name]')?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = collectFormInputValues(target, 'input[data-members-label]', input => input.value);
    const newsletterInputs = Array.from(
        target.querySelectorAll(
            'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
        ) || []
    );
    const newsletters = buildNewslettersPayload(target, newsletterInputs);

    const reqBody = buildMagicLinkRequestBody({
        email, emailType, labels, name, autoRedirect, newsletters, urlHistory: getUrlHistory(), wantsOTC
    });

    setElementState(form, {add: ['loading']});

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});
            if (wantsOTC) {
                await handleOTCResponse(magicLinkRes, email, doAction, captureException);
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

async function createStripeCheckoutSession(siteUrl, payload) {
    return fetchJson(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        errorMessage: t('Could not create stripe checkout session')
    });
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

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(window.location.href, el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(window.location.href, el.dataset.membersCancel);

    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    const urlHistory = getUrlHistory();
    const metadata = {
        ...(member ? {checkoutType: 'upgrade'} : {}),
        ...(urlHistory ? {urlHistory} : {})
    };

    return fetchIdentity(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, {
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        }))
        .then(redirectToStripeCheckout)
        .catch(err => handleElementError(el, errorEl, clickHandler, err));
}

// ─── Stripe Session Handlers ──────────────────────────────────────────────────

function createStripeSessionClickHandler({el, errorEl, siteUrl, apiEndpoint, buildPayload, onSuccess, clickHandler}) {
    return function handler(event) {
        el.removeEventListener('click', handler);
        event.preventDefault();

        clearErrorMessage(errorEl);
        setElementState(el, {add: ['loading']});

        fetchIdentity(siteUrl)
            .then(identity => fetchJson(`${siteUrl}${apiEndpoint}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(buildPayload(identity)),
                errorMessage: t('Could not create stripe checkout session')
            }))
            .then(onSuccess)
            .catch(err => handleElementError(el, errorEl, handler, err));
    };
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

function createSubscriptionClickHandler({el, errorEl, siteUrl, getSubscriptionId, requestBody, errorMessage, clickHandler}) {
    return async function handler(event) {
        event.preventDefault();

        const subscriptionId = getSubscriptionId();

        el.removeEventListener('click', handler);
        setElementState(el, {add: ['loading'], remove: ['error']});
        clearErrorMessage(errorEl);

        const res = await updateSubscription(siteUrl, subscriptionId, requestBody);
        if (res.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', handler);
            setElementState(el, {add: ['error'], remove: ['loading']});
            setErrorMessage(errorEl, errorMessage);
        }
    };
}

// ─── handleDataAttributes ─────────────────────────────────────────────────────

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // Forms
    forEachElement('form[data-members-form]', (form) => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    // Plan buttons
    forEachElement('[data-members-plan]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    // Edit billing
    forEachElement('[data-members-edit-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(window.location.href, el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(window.location.href, el.dataset.membersCancel);

        const clickHandler = createStripeSessionClickHandler({
            el,
            errorEl,
            siteUrl,
            apiEndpoint: '/members/api/create-stripe-update-session/',
            buildPayload: identity => ({identity, successUrl, cancelUrl}),
            onSuccess: result => window.Stripe(result.publicKey).redirectToCheckout({sessionId: result.sessionId})
                .then(result => {
                    if (result.error) {
                        throw new Error(t(result.error.message));
                    }
                }),
            clickHandler: null
        });

        el.addEventListener('click', clickHandler);
    });

    // Manage billing (portal)
    forEachElement('[data-members-manage-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(window.location.href, el.dataset.membersReturn);

        const clickHandler = createStripeSessionClickHandler({
            el,
            errorEl,
            siteUrl,
            apiEndpoint: '/members/api/create-stripe-billing-portal-session/',
            buildPayload: identity => ({identity, returnUrl}),
            onSuccess: result => window.location.assign(result.url),
            clickHandler: null
        });

        el.addEventListener('click', clickHandler);
    });

    // Sign out
    forEachElement('[data-members-signout]', (el) => {
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

    // Cancel subscription
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    forEachElement('[data-members-cancel-subscription]', (el) => {
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
            clearErrorMessage(errorEl);

            const res = await updateSubscription(siteUrl, subscriptionId, {smart_cancel: true});
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                setElementState(el, {add: ['error'], remove: ['loading']});
                setErrorMessage(errorEl, t('There was an error cancelling your subscription, please try again.