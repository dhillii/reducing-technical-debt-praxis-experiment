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

function buildRequestBody({email, emailType, labels, name, autoRedirect, newsletters, wantsOTC}) {
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

    const urlHistory = getUrlHistory();
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

export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    clearErrorMessage(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const {target} = event;
    const email = target.querySelector('input[data-members-email]')?.value;
    const name = (target.querySelector('input[data-members-name]')?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = collectFormInputValues(target, 'input[data-members-label]', el => el.value);
    const newsletters = buildNewsletters(target);
    const reqBody = buildRequestBody({email, emailType, labels, name, autoRedirect, newsletters, wantsOTC});

    setElementState(form, {add: ['loading']});

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});
            if (wantsOTC) {
                await handleOtcResponse(magicLinkRes, email, doAction, captureException);
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

async function redirectToStripeCheckout(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
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

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = resolveUrl(el.dataset.membersSuccess);
    const checkoutCancelUrl = resolveUrl(el.dataset.membersCancel);

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const identity = await fetchMemberSession(siteUrl);
        await redirectToStripeCheckout(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
    } catch (err) {
        handleClickError(err, el, errorEl, clickHandler);
    }
}

// ─── Billing Handlers ─────────────────────────────────────────────────────────

async function createStripeSession(siteUrl, endpoint, body) {
    const res = await fetch(`${siteUrl}/members/api/${endpoint}/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

function makeEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        clearErrorMessage(errorEl);
        setElementState(el, {add: ['loading']});

        try {
            const identity = await fetchMemberSession(siteUrl);
            const result = await createStripeSession(siteUrl, 'create-stripe-update-session', {
                identity,
                successUrl,
                cancelUrl
            });

            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
            if (redirectResult?.error) {
                throw new Error(t(redirectResult.error.message));
            }
        } catch (err) {
            handleClickError(err, el, errorEl, clickHandler);
        }
    }
    return clickHandler;
}

function makeManageBillingClickHandler(el, errorEl, siteUrl, returnUrl) {
    async function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        clearErrorMessage(errorEl);
        setElementState(el, {add: ['loading']});

        try {
            const identity = await fetchMemberSession(siteUrl);
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

function makeCancelSubscriptionClickHandler(el, errorEl, siteUrl, hasRetentionOffers, doAction) {
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
    return clickHandler;
}

function makeContinueSubscriptionClickHandler(el, errorEl, siteUrl) {
    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        clearErrorMessage(errorEl);
        setElementState(el, {add: ['loading'], remove: ['error']});

        const subscriptionId = el.dataset.membersContinueSubscription;

        updateSubscription(siteUrl, subscriptionId, {cancel_at_period_end: false}).then(res => {
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

// ─── Main Handler ─────────────────────────────────────────────────────────────

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    forEachElement('form[data-members-form]', form => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    forEachElement('[data-members-plan]', el => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-edit-billing]', el => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(el.dataset.membersCancel);
        const clickHandler = makeEditBillingClickHandler(el, errorEl, siteUrl, successUrl, cancelUrl);
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-manage-billing]', el => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(el.dataset.membersReturn);
        const clickHandler = makeManageBillingClickHandler(el, errorEl, siteUrl, returnUrl);
        el.addEventListener('click', clickHandler);
    });

    forEachElement('[data-members-signout]', el => {
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