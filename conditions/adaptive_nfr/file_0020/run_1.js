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
    return relative ? new URL(relative, window.location.href).href : undefined;
}

function forEachElement(selector, callback) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), callback);
}

async function fetchMembersSession(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    return res.ok ? res.text() : null;
}

function handleElementError(el, clickHandler, errorEl, message) {
    console.error(message);
    el.addEventListener('click', clickHandler);
    setElementState(el, {add: ['error'], remove: ['loading']});
    setErrorMessage(errorEl, message instanceof Error ? message.message : message);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function collectFormInputValues(target, selector, mapper) {
    return Array.from(target.querySelectorAll(selector) || []).map(mapper);
}

function buildRequestBody(formData) {
    const {email, emailType, labels, name, autoRedirect, newsletters, wantsOTC, urlHistory, checkableNewsletterInputs} = formData;

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

    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else if (checkableNewsletterInputs.length > 0) {
        reqBody.newsletters = [];
    }

    return reqBody;
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

async function handleOtcResponse(magicLinkRes, email, wantsOTC, doAction, captureException) {
    if (!wantsOTC) {
        return;
    }

    let responseBody;
    try {
        responseBody = await magicLinkRes.clone().json();
    } catch (e) {
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

    const target = event.target;
    const email = target.querySelector('input[data-members-email]')?.value;
    const nameInput = target.querySelector('input[data-members-name]');
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = collectFormInputValues(target, 'input[data-members-label]', el => el.value);
    const newsletterSelector = 'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked';
    const newsletters = collectFormInputValues(target, newsletterSelector, el => ({name: el.value}));
    const checkableNewsletterInputs = target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];

    const reqBody = buildRequestBody({
        email, emailType, labels, name, autoRedirect,
        newsletters, wantsOTC, urlHistory: getUrlHistory(), checkableNewsletterInputs
    });

    setElementState(form, {add: ['loading']});

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});
            await handleOtcResponse(magicLinkRes, email, wantsOTC, doAction, captureException);
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            setErrorMessage(errorEl, chooseBestErrorMessage(e, t('Failed to send magic link email')));
            setElementState(form, {add: ['error']});
        }
    } catch (err) {
        setElementState(form, {add: ['error']});
        setErrorMessage(errorEl, chooseBestErrorMessage(err, t('There was an error sending the email, please try again')));
    }
}

// ─── Plan Click Handler ───────────────────────────────────────────────────────

async function createStripeCheckoutSession(siteUrl, body) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
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

    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(null, el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(null, el.dataset.membersCancel);

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const identity = await fetchMembersSession(siteUrl);
        const responseBody = await createStripeCheckoutSession(siteUrl, {
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        });
        await redirectToStripeCheckout(responseBody);
    } catch (err) {
        handleElementError(el, clickHandler, errorEl, err);
    }
}

// ─── Data Attribute Handlers ──────────────────────────────────────────────────

function registerFormHandlers(siteUrl, doAction, captureException) {
    forEachElement('form[data-members-form]', (form) => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

function registerPlanClickHandlers(siteUrl, site, member) {
    forEachElement('[data-members-plan]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

function registerEditBillingHandlers(siteUrl) {
    forEachElement('[data-members-edit-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(null, el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(null, el.dataset.membersCancel);

        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            clearErrorMessage(errorEl);
            setElementState(el, {add: ['loading']});

            try {
                const identity = await fetchMembersSession(siteUrl);
                const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, successUrl, cancelUrl})
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
            } catch (err) {
                handleElementError(el, clickHandler, errorEl, err);
            }
        }

        el.addEventListener('click', clickHandler);
    });
}

function registerManageBillingHandlers(siteUrl) {
    forEachElement('[data-members-manage-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(null, el.dataset.membersReturn);

        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            clearErrorMessage(errorEl);
            setElementState(el, {add: ['loading']});

            try {
                const identity = await fetchMembersSession(siteUrl);
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
                handleElementError(el, clickHandler, errorEl, err);
            }
        }

        el.addEventListener('click', clickHandler);
    });
}

function registerSignOutHandlers(siteUrl) {
    forEachElement('[data-members-signout]', (el) => {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            setElementState(el, {add: ['loading'], remove: ['error']});

            fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'}).then((res) => {
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

            try {
                const identity = await fetchMembersSession(siteUrl);
                const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, smart_cancel: true})
                });

                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {add: ['error'], remove: ['loading']});
                    setErrorMessage(errorEl, t('There was an error cancelling your subscription, please try again.'));
                }
            } catch (err) {
                handleElementError(el, clickHandler, errorEl, err);
            }
        }

        el.addEventListener('click', clickHandler);
    });
}

function registerContinueSubscriptionHandlers(siteUrl) {
    forEachElement('[data-members-continue-subscription]', (el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            setElementState(el, {add: ['loading'], remove: ['error']});
            clearErrorMessage(errorEl);

            const subscriptionId = el.dataset.membersContinueSubscription;

            try {
                const identity = await fetchMembersSession(siteUrl);
                const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, cancel_at_period_end: false})
                });

                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {add: ['error'], remove: ['loading']});
                    setErrorMessage(errorEl, t('There was an error continuing your subscription, please try again.'));
                }