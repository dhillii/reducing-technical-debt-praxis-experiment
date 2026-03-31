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

function handleElementError(el, clickHandler, errorEl, message) {
    console.error(message);
    el.addEventListener('click', clickHandler);
    setElementState(el, {add: ['error'], remove: ['loading']});
    setErrorMessage(errorEl, message instanceof Error ? message.message : message);
}

// ─── Form Submit Handler ──────────────────────────────────────────────────────

function buildFormRequestBody(event, form) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;

    const labels = [...event.target.querySelectorAll('input[data-members-label]')]
        .map(input => input.value);

    const newsletterInputs = [
        ...event.target.querySelectorAll(
            'input[type=hidden][data-members-newsletter], ' +
            'input[type=checkbox][data-members-newsletter]:checked, ' +
            'input[type=radio][data-members-newsletter]:checked'
        )
    ];
    const newsletters = newsletterInputs.map(input => ({name: input.value}));

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    const urlHistory = getUrlHistory();
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    return {reqBody, email, emailType};
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

export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    clearErrorMessage(errorEl);
    setElementState(form, {remove: ['success', 'invalid', 'error']});

    const {reqBody, email, emailType} = buildFormRequestBody(event, form);
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    setElementState(form, {add: ['loading']});

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        setElementState(form, {remove: ['loading']});

        if (magicLinkRes.ok) {
            setElementState(form, {add: ['success']});

            if (wantsOTC) {
                let responseBody;
                try {
                    responseBody = await magicLinkRes.clone().json();
                } catch {
                    responseBody = undefined;
                }
                await handleOtcResponse(responseBody, email, doAction, captureException);
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

// ─── Stripe Helpers ───────────────────────────────────────────────────────────

async function redirectToStripeCheckout(siteUrl, sessionData) {
    const identity = await fetchMemberSession(siteUrl);

    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...sessionData, identity})
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

// ─── Plan Click Handler ───────────────────────────────────────────────────────

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    clearErrorMessage(errorEl);
    setElementState(el, {add: ['loading']});

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = resolveUrl(el.dataset.membersSuccess);
    const cancelUrl = resolveUrl(el.dataset.membersCancel);
    const urlHistory = getUrlHistory();

    const metadata = {
        ...(member ? {checkoutType: 'upgrade'} : {}),
        ...(urlHistory ? {urlHistory} : {})
    };

    return redirectToStripeCheckout(siteUrl, {
        ...requestData,
        successUrl,
        cancelUrl,
        metadata
    }).catch((err) => {
        handleElementError(el, clickHandler, errorEl, err);
    });
}

// ─── Data Attribute Handlers ──────────────────────────────────────────────────

function setupFormHandlers(siteUrl, doAction, captureException) {
    forEachElement('form[data-members-form]', (form) => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });
}

function setupPlanHandlers(siteUrl, site, member) {
    forEachElement('[data-members-plan]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}

function setupEditBillingHandlers(siteUrl) {
    forEachElement('[data-members-edit-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = resolveUrl(el.dataset.membersSuccess);
        const cancelUrl = resolveUrl(el.dataset.membersCancel);

        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            clearErrorMessage(errorEl);
            setElementState(el, {add: ['loading']});

            try {
                const identity = await fetchMemberSession(siteUrl);
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

function setupManageBillingHandlers(siteUrl) {
    forEachElement('[data-members-manage-billing]', (el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = resolveUrl(el.dataset.membersReturn);

        async function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            clearErrorMessage(errorEl);
            setElementState(el, {add: ['loading']});

            try {
                const identity = await fetchMemberSession(siteUrl);
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

function setupSignOutHandlers(siteUrl) {
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

function setupCancelSubscriptionHandlers(siteUrl, doAction, hasRetentionOffers) {
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
            setElementState(el, {add: ['loading'], remove: ['error']});
            clearErrorMessage(errorEl);

            fetchMemberSession(siteUrl).then((identity) => {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, smart_cancel: true})
                });
            }).then((res) => {
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
}

function setupContinueSubscriptionHandlers(siteUrl) {
    forEachElement('[data-members-continue-subscription]', (el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            setElementState(el, {add: ['loading'], remove: ['error']});
            clearErrorMessage(errorEl);

            const subscriptionId = el.dataset.membersContinueSubscription;

            fetchMemberSession(siteUrl).then((identity) => {
                return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({identity, cancel_at_period_end: false})
                });
            }).then((res) => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    setElementState(el, {add: ['error'], remove: ['loading']});
                    setErrorMessage(errorEl, t('There was an error continuing your subscription, please try again.'));
                }
            });
        }

        el.addEventListener('click', clickHandler);
    });
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    setupFormHandlers(siteUrl,