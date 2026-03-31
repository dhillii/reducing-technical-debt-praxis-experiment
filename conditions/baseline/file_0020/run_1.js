```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ─── Utilities ───────────────────────────────────────────────────────────────

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

function resolveUrl(url) {
    return url ? new URL(url, window.location.href).href : undefined;
}

function forEachElement(selector, callback) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), callback);
}

async function fetchMemberSession(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

function handleClickError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    setElementState(el, {add: ['error'], remove: ['loading']});
    setErrorMessage(errorEl, err.message);
}

function collectInputValues(form, selector) {
    return Array.from(form.querySelectorAll(selector)).map(input => input.value);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function buildNewsletters(form) {
    const checkedSelector = 'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked';
    const checkedInputs = form.querySelectorAll(checkedSelector);

    if (checkedInputs.length > 0) {
        return Array.from(checkedInputs).map(input => ({name: input.value}));
    }

    const checkableInputs = form.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return checkableInputs.length > 0 ? [] : undefined;
}

function buildRequestBody(form, event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const labels = collectInputValues(event.target, 'input[data-members-label]');
    const newsletters = buildNewsletters(event.target);
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    const urlHistory = getUrlHistory();
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletters !== undefined) {
        reqBody.newsletters = newsletters;
    }

    return {reqBody, wantsOTC, email};
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

export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    clearErrorMessage(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error'], add: ['loading']});

    const {reqBody, wantsOTC, email} = buildRequestBody(form, event);

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

async function createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata
        })
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
    const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});

    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = resolveUrl(el.dataset.membersSuccess);
    const checkoutCancelUrl = resolveUrl(el.dataset.membersCancel);

    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    const urlHistory = getUrlHistory();
    const metadata = {
        ...(member ? {checkoutType: 'upgrade'} : {}),
        ...(urlHistory ? {urlHistory} : {})
    };

    try {
        const identity = await fetchMemberSession(siteUrl);
        const responseBody = await createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        await redirectToStripeCheckout(responseBody);
    } catch (err) {
        handleClickError(err, el, errorEl, clickHandler);
    }
}

// ─── Billing Handlers ─────────────────────────────────────────────────────────

async function createStripeSession(siteUrl, endpoint, body, errorMessage) {
    const identity = await fetchMemberSession(siteUrl);
    const res = await fetch(`${siteUrl}/members/api/${endpoint}/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, ...body})
    });

    if (!res.ok) {
        throw new Error(t(errorMessage));
    }

    return res.json();
}

function makeClickHandler(el, errorEl, handler) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        clearErrorMessage(errorEl);
        setElementState(el, {add: ['loading']});

        try {
            await handler();
        } catch (err) {
            handleClickError(err, el, errorEl, clickHandler);
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

function makeSubscriptionClickHandler(el, errorEl, getBody, errorMessage) {
    function clickHandler(event) {
        event.preventDefault();
        const subscriptionId = el.dataset.membersCancelSubscription || el.dataset.membersContinueSubscription;

        el.removeEventListener('click', clickHandler);
        setElementState(el, {remove: ['error'], add: ['loading']});
        clearErrorMessage(errorEl);

        updateSubscription(siteUrl, subscriptionId, getBody())
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {add: ['error'], remove: ['loading']});
                    setErrorMessage(errorEl, t(errorMessage));
                }
            });
    }
    return clickHandler;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

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

        const clickHandler = makeClickHandler(el, errorEl, async () => {
            const result = await createStripeSession(
                siteUrl,
                'create-stripe-update-session',
                {successUrl, cancelUrl},
                'Could not create stripe checkout session'
            );
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult.error) {
                throw new Error(t(redirectResult.error.message));
            }
        });

        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-manage-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(el.dataset.membersReturn);

        const clickHandler = makeClickHandler(el, errorEl, async () => {
            const result = await createStripeSession(
                siteUrl,
                'create-stripe-billing-portal-session',
                {returnUrl},
                'Could not create Stripe billing portal session'
            );
            window.location.assign(result.url);
        });

        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-signout]', (el) => {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            setElementState(el, {remove: ['error'], add: ['loading']});

            fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'}).then(res => {
                if (res.ok) {
                    window.location.replace(siteUrl);
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {remove: ['loading'], add: ['error']});
                }
            });
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    forEachElement('[data-members-cancel-subscription]', (el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        function clickHandler(event) {
            event.preventDefault();
            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction('openPopup', {page: 'accountPlan', pageData: {subscriptionId, action: 'cancel'}});
                return;
            }

            el.removeEventListener('click', clickHandler);
            setElementState(el, {remove: ['error'], add: ['loading']});
            clearErrorMessage(errorEl);

            updateSubscription(siteUrl, subscriptionId, {smart_cancel: true}).then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {add: ['error'], remove: ['loading']});
                    setErrorMessage(errorEl, t('There was an error cancelling your subscription, please try again.'));
                }
            });
        }

        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-continue-subscription]', (el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            setElementState(el, {remove: ['error'], add: ['loading']});
            clearErrorMessage(errorEl);

            const subscriptionId = el.dataset.membersC