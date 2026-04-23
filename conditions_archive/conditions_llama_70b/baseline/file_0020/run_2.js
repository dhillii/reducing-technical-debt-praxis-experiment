```javascript
/* eslint-disable no-console */
import { getCheckoutSessionDataFromPlanAttribute, getUrlHistory } from './utils/helpers';
import { HumanReadableError, chooseBestErrorMessage } from './utils/errors';
import { t } from './utils/i18n';

function displayErrorIfElementExists(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function handleError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

async function getMagicLinkResponse(siteUrl, reqBody) {
    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, { method: 'GET' });
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...reqBody, integrityToken })
        });

        return magicLinkRes;
    } catch (err) {
        throw err;
    }
}

async function handleMagicLinkResponse(magicLinkRes, form, errorEl, wantsOTC, doAction) {
    if (magicLinkRes.ok) {
        form.classList.add('success');

        let responseBody;
        if (wantsOTC) {
            try {
                responseBody = await magicLinkRes.clone().json();
            } catch (e) {
                responseBody = undefined;
            }
        }

        const otcRef = responseBody?.otc_ref;
        if (otcRef && typeof doAction === 'function') {
            try {
                doAction('startSigninOTCFromCustomForm', {
                    email: (responseBody?.email || '').trim(),
                    otcRef,
                    inboxLinks: responseBody?.inboxLinks
                });
            } catch (e) {
                console.error(e);
            }
        }
    } else {
        const e = await HumanReadableError.fromApiResponse(magicLinkRes);
        const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
        displayErrorIfElementExists(errorEl, errorMessage);
        form.classList.add('error');
    }
}

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
    const emailType = form.dataset.membersForm;
    const labels = Array.from(event.target.querySelectorAll('input[data-members-label]')).map(input => input.value);
    const newsletters = Array.from(event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked')).map(input => ({ name: input.value }));

    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
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
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]');
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    try {
        const magicLinkRes = await getMagicLinkResponse(siteUrl, reqBody);
        await handleMagicLinkResponse(magicLinkRes, form, errorEl, wantsOTC, doAction);
    } catch (err) {
        handleError(err, form, errorEl);
    } finally {
        form.classList.remove('loading');
        form.addEventListener('submit', submitHandler);
    }
}

async function getCheckoutSessionResponse(siteUrl, requestData) {
    try {
        const res = await fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' });
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        const identity = await res.text();

        const checkoutSessionRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestData, identity })
        });

        if (!checkoutSessionRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        return checkoutSessionRes;
    } catch (err) {
        throw err;
    }
}

async function handleCheckoutSessionResponse(checkoutSessionRes, el, errorEl) {
    try {
        const responseBody = await checkoutSessionRes.json();
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        return stripe.redirectToCheckout({ sessionId: responseBody.sessionId });
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

function planClickHandler({ event, el, errorEl, siteUrl, site, member, clickHandler }) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const metadata = member ? { checkoutType: 'upgrade' } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    const finalRequestData = {
        ...requestData,
        successUrl: checkoutSuccessUrl,
        cancelUrl: checkoutCancelUrl,
        metadata
    };

    getCheckoutSessionResponse(siteUrl, finalRequestData).then(res => handleCheckoutSessionResponse(res, el, errorEl));
}

function handleDataAttributes({
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

    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => formSubmitHandler({ event, errorEl, form, siteUrl, submitHandler, doAction, captureException });
        form.addEventListener('submit', submitHandler);
    });

    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = event => planClickHandler({ el, event, errorEl, member, site, siteUrl, clickHandler });
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;

        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
                .then(res => res.text())
                .then(identity => fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity, successUrl, cancelUrl })
                }))
                .then(res => res.json())
                .then(result => {
                    const stripe = window.Stripe(result.publicKey);
                    return stripe.redirectToCheckout({ sessionId: result.sessionId });
                })
                .catch(err => {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    if (errorEl) {
                        errorEl.innerText = err.message;
                    }
                    el.classList.add('error');
                });
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
                .then(res => res.text())
                .then(identity => fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity, returnUrl })
                }))
                .then(res => res.json())
                .then(result => window.location.assign(result.url))
                .catch(err => {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    if (errorEl) {
                        errorEl.innerText = err.message;
                    }
                    el.classList.add('error');
                });
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, { method: 'DELETE' })
                .then(res => {
                    if (res.ok) {
                        window.location.replace(siteUrl);
                    } else {
                        el.addEventListener('click', clickHandler);
                        el.classList.remove('loading');
                        el.classList.add('error');
                    }
                });
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;

        const clickHandler = event => {
            event.preventDefault();

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

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
                .then(res => res.text())
                .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity, smart_cancel: true })
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
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;

        const clickHandler = event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetch(`${siteUrl}/members/api/session`, { credentials: 'same-origin' })
                .then(res => res.text())
                .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity, cancel_at_period_end: false })
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
        };
        el.addEventListener('click', clickHandler);
    });
}

export { formSubmitHandler, planClickHandler, handleDataAttributes };
```