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
function isEmailTypeSignin(emailType) {
    return emailType === 'signin';
}

/** @private */
function wantsOTC(emailType, otcFlag) {
    return isEmailTypeSignin(emailType) && otcFlag === 'true';
}

/** @private */
function buildReqBody(email, emailType, labels, name, autoRedirect, urlHistory, newsletters, wantsOTCFlag) {
    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };
    if (wantsOTCFlag) {
        body.includeOTC = true;
    }
    if (urlHistory) {
        body.urlHistory = urlHistory;
    }
    if (newsletters.length > 0) {
        body.newsletters = newsletters;
    } else {
        // If there were only checkable newsletter inputs but none were checked
        const checkableNewsletterInputs = document.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            body.newsletters = [];
        }
    }
    return body;
}

/** @private */
async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return res.text();
}

/** @private */
async function fetchMagicLink(siteUrl, reqBody) {
    return fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(reqBody)
    });
}

/** @private */
async function handleMagicLinkResponse(magicLinkRes, wantsOTCFlag, doAction, email, captureException) {
    if (!magicLinkRes.ok) {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        return {error: errorMessage};
    }

    let responseBody;
    if (wantsOTCFlag) {
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
    let emailType = form?.dataset?.membersForm;
    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(el => el.value);
    const newsletterInputs = Array.from(event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ));
    const newsletters = newsletterInputs.map(el => ({name: el.value}));

    const wantsOTCFlag = wantsOTC(emailType, form?.dataset?.membersOtc);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildReqBody(email, emailType, labels, name, autoRedirect, urlHistory, newsletters, wantsOTCFlag);

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await fetchMagicLink(siteUrl, {...reqBody, integrityToken});
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        const result = await handleMagicLinkResponse(magicLinkRes, wantsOTCFlag, doAction, email, captureException);
        if (result.error) {
            displayErrorIfElementExists(errorEl, result.error);
            form.classList.add('error');
        } else {
            form.classList.add('success');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @private */
function isSuccessUrlDefined(successUrl) {
    return !!successUrl;
}

/** @private */
function isCancelUrlDefined(cancelUrl) {
    return !!cancelUrl;
}

/** @private */
function buildCheckoutUrls(successUrl, cancelUrl) {
    let checkoutSuccessUrl, checkoutCancelUrl;
    if (isSuccessUrlDefined(successUrl)) {
        checkoutSuccessUrl = (new URL(successUrl, window.location.href)).href;
    }
    if (isCancelUrlDefined(cancelUrl)) {
        checkoutCancelUrl = (new URL(cancelUrl, window.location.href)).href;
    }
    return {checkoutSuccessUrl, checkoutCancelUrl};
}

/** @private */
async function fetchSessionIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) {
        return null;
    }
    return res.text();
}

/** @private */
async function createStripeCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        })
    });
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/** @private */
async function handleCheckoutResponse(responseBody) {
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
export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const {checkoutSuccessUrl, checkoutCancelUrl} = buildCheckoutUrls(el.dataset.membersSuccess, el.dataset.membersCancel);

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    fetchSessionIdentity(siteUrl)
        .then(identity => createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata))
        .then(handleCheckoutResponse)
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) {
                errorEl.innerText = err.message;
            }
            el.classList.add('error');
        });
}

/** @private */
function registerFormHandler(form, siteUrl, submitHandler, doAction, captureException) {
    const errorEl = form.querySelector('[data-members-error]');
    function submitHandlerWrapper(event) {
        formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
    }
    form.addEventListener('submit', submitHandlerWrapper);
}

/** @private */
function registerPlanHandler(el, siteUrl, member, site, clickHandler) {
    const errorEl = el.querySelector('[data-members-error]');
    function clickHandlerWrapper(event) {
        planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
    }
    el.addEventListener('click', clickHandlerWrapper);
}

/** @private */
async function fetchIdentity(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    if (!res.ok) {
        return null;
    }
    return res.text();
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
function registerEditBillingHandler(el, siteUrl, clickHandler) {
    const errorEl = el.querySelector('[data-members-error]');
    const membersSuccess = el.dataset.membersSuccess;
    const membersCancel = el.dataset.membersCancel;
    const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
    const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;

    function clickHandlerWrapper(event) {
        el.removeEventListener('click', clickHandlerWrapper);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        el.classList.add('loading');

        fetchIdentity(siteUrl)
            .then(identity => createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl))
            .then(result => {
                const stripe = window.Stripe(result.publicKey);
                return stripe.redirectToCheckout({sessionId: result.sessionId});
            })
            .then(result => {
                if (result.error) {
                    throw new Error(t(result.error.message));
                }
            })
            .catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandlerWrapper);
                el.classList.remove('loading');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                el.classList.add('error');
            });
    }
    el.addEventListener('click', clickHandlerWrapper);
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
function registerManageBillingHandler(el, siteUrl, clickHandler) {
    const errorEl = el.querySelector('[data-members-error]');
    const membersReturn = el.dataset.membersReturn;
    const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

    function clickHandlerWrapper(event) {
        el.removeEventListener('click', clickHandlerWrapper);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        el.classList.add('loading');

        fetchIdentity(siteUrl)
            .then(identity => createStripeBillingPortalSession(siteUrl, identity, returnUrl))
            .then(result => {
                window.location.assign(result.url);
            })
            .catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandlerWrapper);
                el.classList.remove('loading');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                el.classList.add('error');
            });
    }
    el.addEventListener('click', clickHandlerWrapper);
}

/** @private */
function registerSignoutHandler(el, siteUrl) {
    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
            .then(res => {
                if (res.ok) {
                    window.location.replace(siteUrl);
                } else {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                }
            });
    }
    el.addEventListener('click', clickHandler);
}

/** @private */
function registerCancelSubscriptionHandler(el, siteUrl, doAction, offers, errorEl) {
    const subscriptionId = el.dataset.membersCancelSubscription;
    const hasRetentionOffers = offers.some(offer => offer.redemption_type === 'retention');

    function clickHandler(event) {
        event.preventDefault();

        if (hasRetentionOffers) {
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
                    el.classList.remove('loading');
                    el.classList.add('error');
                    if (errorEl) {
                        errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                    }
                }
            });
    }
    el.addEventListener('click', clickHandler);
}

/** @private */
function registerContinueSubscriptionHandler(el, siteUrl, errorEl) {
    const subscriptionId = el.dataset.membersContinueSubscription;

    function clickHandler(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        el.classList.remove('error');
        el.classList.add('loading');

        if (errorEl) {
            errorEl.innerText = '';
        }

        fetchIdentity(siteUrl)
            .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({identity, cancel_at_period_end: false})
            }))
            .then(res => {
                if (res.ok) {
                    window.location.reload();
                } else {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                    if (errorEl) {
                        errorEl.innerText = t('There was an error continuing your subscription, please try again.');
                    }
                }
            });
    }
    el.addEventListener('click', clickHandler);
}

/** @private */
export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), form => {
        registerFormHandler(form, siteUrl, formSubmitHandler, doAction, captureException);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), el => {
        registerPlanHandler(el, siteUrl, member, site, planClickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), el => {
        registerEditBillingHandler(el, siteUrl, planClickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), el => {
        registerManageBillingHandler(el, siteUrl, planClickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), el => {
        registerSignoutHandler(el, siteUrl);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        registerCancelSubscriptionHandler(el, siteUrl, doAction, offers, errorEl);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        registerContinueSubscriptionHandler(el, siteUrl, errorEl);
    });
}