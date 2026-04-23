import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

/** @private */
function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/** @private */
function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/** @private */
function isOTC(emailType, otcFlag) {
    return emailType === 'signin' && otcFlag === 'true';
}

/** @private */
function getNewsletterInputs(event) {
    return event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    );
}

/** @private */
function getLabelInputs(event) {
    return event.target.querySelectorAll('input[data-members-label]');
}

/** @private */
function getCheckableNewsletterInputs(event) {
    return event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
}

/** @private */
function buildReqBody(email, emailType, labels, name, autoRedirect, urlHistory, newsletters, wantsOTC) {
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
    if (newsletters.length > 0) {
        body.newsletters = newsletters;
    }
    return body;
}

/** @private */
async function sendMagicLink(siteUrl, reqBody) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
}

/** @private */
async function handleMagicLinkResponse(form, magicLinkRes, wantsOTC, doAction, captureException, email) {
    if (!magicLinkRes.ok) {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        form.classList.add('error');
        return {error: errorMessage};
    }

    form.classList.add('success');

    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch {
            responseBody = undefined;
        }
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

    return {success: true};
}

/** @private */
export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form?.dataset?.membersForm;
    const wantsOTC = isOTC(emailType, form?.dataset?.membersOtc);

    const labels = Array.from(getLabelInputs(event), el => el.value);
    const newsletterInputs = getNewsletterInputs(event);
    const newsletters = Array.from(newsletterInputs, el => ({name: el.value}));

    if (newsletterInputs.length === 0 && getCheckableNewsletterInputs(event).length > 0) {
        newsletters.length = 0;
    }

    const urlHistory = getUrlHistory();
    const reqBody = buildReqBody(email, emailType, labels, name, autoRedirect, urlHistory, newsletters, wantsOTC);

    form.classList.add('loading');

    try {
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody);
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        const result = await handleMagicLinkResponse(form, magicLinkRes, wantsOTC, doAction, captureException, email);
        if (result?.error) {
            displayErrorIfElementExists(errorEl, result.error);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @private */
async function createStripeCheckoutSession(siteUrl, requestData, successUrl, cancelUrl, metadata) {
    const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    const identity = sessionRes.ok ? await sessionRes.text() : null;

    const body = {
        ...requestData,
        identity,
        successUrl,
        cancelUrl,
        metadata
    };

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

/** @private */
async function redirectToStripeCheckout(responseBody) {
    if (responseBody.url) {
        window.location.assign(responseBody.url);
        return;
    }
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

/** @private */
export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess
        ? new URL(el.dataset.membersSuccess, window.location.href).href
        : undefined;
    const cancelUrl = el.dataset.membersCancel
        ? new URL(el.dataset.membersCancel, window.location.href).href
        : undefined;

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const responseBody = await createStripeCheckoutSession(siteUrl, requestData, successUrl, cancelUrl, metadata);
        await redirectToStripeCheckout(responseBody);
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

/** @private */
async function fetchStripeSession(siteUrl, credentials = 'same-origin') {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials});
    return res.ok ? await res.text() : null;
}

/** @private */
async function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, successUrl, cancelUrl})
    });
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/** @private */
async function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({identity, returnUrl})
    });
    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }
    return res.json();
}

/** @private */
async function handleStripeSessionClick(el, siteUrl, successUrl, cancelUrl, returnUrl, clickHandler, errorEl, fetchSession, createSession, redirect) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetchSession(siteUrl);
        const result = await createSession(siteUrl, identity, successUrl, cancelUrl, returnUrl);
        if (redirect) {
            await redirect(result);
        } else {
            window.location.assign(result.url);
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    }
}

/** @private */
async function handleSignoutClick(el, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    } catch {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

/** @private */
async function handleSubscriptionAction(el, siteUrl, action, errorEl, clickHandler, doAction, hasRetentionOffers) {
    const subscriptionId = el.dataset.membersCancelSubscription || el.dataset.membersContinueSubscription;
    if (!subscriptionId) return;

    if (hasRetentionOffers && action === 'cancel') {
        doAction('openPopup', {
            page: 'accountPlan',
            pageData: {subscriptionId, action: 'cancel'}
        });
        return;
    }

    el.removeEventListener('click', clickHandler);
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identity = await fetchStripeSession(siteUrl);
        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                ...(action === 'cancel' ? {smart_cancel: true} : {cancel_at_period_end: false})
            })
        });

        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error();
        }
    } catch {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) {
            const msg = action === 'cancel'
                ? t('There was an error cancelling your subscription, please try again.')
                : t('There was an error continuing your subscription, please try again.');
            errorEl.innerText = msg;
        }
    }
}

/** @private */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const successUrl = el.dataset.membersSuccess
            ? new URL(el.dataset.membersSuccess, window.location.href).href
            : undefined;
        const cancelUrl = el.dataset.membersCancel
            ? new URL(el.dataset.membersCancel, window.location.href).href
            : undefined;

        function clickHandler(event) {
            handleStripeSessionClick(
                el,
                siteUrl,
                successUrl,
                cancelUrl,
                undefined,
                clickHandler,
                errorEl,
                fetchStripeSession,
                createStripeUpdateSession,
                null
            );
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const returnUrl = el.dataset.membersReturn
            ? new URL(el.dataset.membersReturn, window.location.href).href
            : undefined;

        function clickHandler(event) {
            handleStripeSessionClick(
                el,
                siteUrl,
                undefined,
                undefined,
                returnUrl,
                clickHandler,
                errorEl,
                fetchStripeSession,
                createStripeBillingPortalSession,
                null
            );
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(el, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleSubscriptionAction(el, siteUrl, 'cancel', errorEl, clickHandler, doAction, hasRetentionOffers);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleSubscriptionAction(el, siteUrl, 'continue', errorEl, clickHandler, doAction, hasRetentionOffers);
        }
        el.addEventListener('click', clickHandler);
    });
}