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
function isSuccessResponse(res) {
    return res.ok;
}

/** @private */
function isOkResponse(res) {
    return res.ok;
}

/** @private */
function isErrorResponse(res) {
    return !res.ok;
}

/** @private */
function isValidResponse(res) {
    return res.ok;
}

/** @private */
async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
    }
    return res.json();
}

/** @private */
async function fetchText(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
    }
    return res.text();
}

/** @private */
async function formSubmitHandler({
    event,
    form,
    errorEl,
    siteUrl,
    submitHandler,
    doAction,
    captureException
}) {
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
    let emailType = undefined;
    const labels = [];
    const newsletters = [];

    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }

    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }

    if (form.dataset.membersForm) {
        emailType = form.dataset.membersForm;
    }

    const otcFlag = form?.dataset?.membersOtc;
    const wantsOTCFlag = wantsOTC(emailType, otcFlag);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTCFlag) {
        reqBody.includeOTC = true;
    }
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }
    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll(
            'input[type=checkbox][data-members-newsletter]'
        ) || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    try {
        const integrityToken = await fetchText(`${siteUrl}/members/api/integrity-token/`, {
            method: 'GET'
        });

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (isSuccessResponse(magicLinkRes)) {
            form.classList.add('success');

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
        } else {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/** @private */
async function planClickHandler({
    event,
    el,
    errorEl,
    siteUrl,
    site,
    member,
    clickHandler
}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    let checkoutSuccessUrl;
    let checkoutCancelUrl;

    if (successUrl) {
        checkoutSuccessUrl = new URL(successUrl, window.location.href).href;
    }

    if (cancelUrl) {
        checkoutCancelUrl = new URL(cancelUrl, window.location.href).href;
    }

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
        const identity = await fetchText(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        const responseBody = await fetchJson(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

        if (responseBody.url) {
            window.location.assign(responseBody.url);
        } else {
            const stripe = window.Stripe(responseBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({
                sessionId: responseBody.sessionId
            });
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
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
async function editBillingClickHandler({
    el,
    errorEl,
    siteUrl,
    clickHandler,
    membersSuccess,
    membersCancel
}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetchText(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        const result = await fetchJson(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                successUrl: membersSuccess,
                cancelUrl: membersCancel
            })
        });

        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({
            sessionId: result.sessionId
        });

        if (redirectResult.error) {
            throw new Error(t(redirectResult.error.message));
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
async function manageBillingClickHandler({
    el,
    errorEl,
    siteUrl,
    clickHandler,
    returnUrl
}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    try {
        const identity = await fetchText(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        const result = await fetchJson(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                returnUrl
            })
        });

        window.location.assign(result.url);
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
async function signoutClickHandler({el, siteUrl}) {
    el.removeEventListener('click', signoutClickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    try {
        const res = await fetch(`${siteUrl}/members/api/session`, {
            method: 'DELETE'
        });

        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', signoutClickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    } catch {
        el.addEventListener('click', signoutClickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

/** @private */
async function cancelSubscriptionClickHandler({
    el,
    errorEl,
    siteUrl,
    doAction,
    hasRetentionOffers
}) {
    event.preventDefault();

    const subscriptionId = el.dataset.membersCancelSubscription;

    if (hasRetentionOffers) {
        doAction('openPopup', {
            page: 'accountPlan',
            pageData: {
                subscriptionId,
                action: 'cancel'
            }
        });
        return;
    }

    el.removeEventListener('click', cancelSubscriptionClickHandler);
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identity = await fetchText(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                smart_cancel: true
            })
        });

        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error();
        }
    } catch {
        el.addEventListener('click', cancelSubscriptionClickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) {
            errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
        }
    }
}

/** @private */
async function continueSubscriptionClickHandler({
    el,
    errorEl,
    siteUrl
}) {
    event.preventDefault();

    const subscriptionId = el.dataset.membersContinueSubscription;

    el.removeEventListener('click', continueSubscriptionClickHandler);
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    try {
        const identity = await fetchText(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        const res = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                cancel_at_period_end: false
            })
        });

        if (res.ok) {
            window.location.reload();
        } else {
            throw new Error();
        }
    } catch {
        el.addEventListener('click', continueSubscriptionClickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) {
            errorEl.innerText = t('There was an error continuing your subscription, please try again.');
        }
    }
}

/** @public */
export function handleDataAttributes({
    siteUrl,
    site = {},
    member,
    offers = [],
    doAction,
    captureException
} = {}) {
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
            planClickHandler({el, event, errorEl, site, siteUrl, member, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        function clickHandler(event) {
            editBillingClickHandler({
                el,
                errorEl,
                siteUrl,
                clickHandler,
                membersSuccess,
                membersCancel
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? new URL(membersReturn, window.location.href).href : undefined;
        function clickHandler(event) {
            manageBillingClickHandler({
                el,
                errorEl,
                siteUrl,
                clickHandler,
                returnUrl
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            signoutClickHandler({el, siteUrl});
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            cancelSubscriptionClickHandler({
                el,
                errorEl,
                siteUrl,
                doAction,
                hasRetentionOffers
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            continueSubscriptionClickHandler({
                el,
                errorEl,
                siteUrl
            });
        }
        el.addEventListener('click', clickHandler);
    });
}