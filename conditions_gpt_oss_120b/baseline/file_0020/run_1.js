/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

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
    let emailType;
    const labels = [];
    const newsletters = [];

    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }

    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }

    if (form.dataset.membersForm) {
        emailType = form.dataset.membersForm;
    }

    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
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
    if (newsletterInputs.length > 0) {
        reqBody.newsletters = newsletters;
    } else {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
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

/* ---------- Helper Functions for Click Handlers ---------- */

async function handlePlanClick({el, errorEl, siteUrl, site, member}) {
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

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    const identity = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => (res.ok ? res.text() : null));

    const sessionResponse = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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

    if (!sessionResponse.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const responseBody = await sessionResponse.json();

    if (responseBody.url) {
        window.location.assign(responseBody.url);
    } else {
        const stripe = window.Stripe(responseBody.publicKey);
        const redirectResult = await stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
    }
}

async function handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl}) {
    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const identity = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => (res.ok ? res.text() : null));

    const sessionResponse = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity,
            successUrl,
            cancelUrl
        })
    });

    if (!sessionResponse.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const result = await sessionResponse.json();
    const stripe = window.Stripe(result.publicKey);
    const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});
    if (redirectResult.error) {
        throw new Error(t(redirectResult.error.message));
    }
}

async function handleManageBillingClick({el, errorEl, siteUrl, returnUrl}) {
    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const identity = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => (res.ok ? res.text() : null));

    const sessionResponse = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity,
            returnUrl
        })
    });

    if (!sessionResponse.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    const result = await sessionResponse.json();
    window.location.assign(result.url);
}

async function handleSignoutClick({el, siteUrl}) {
    const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});
    if (res.ok) {
        window.location.replace(siteUrl);
    } else {
        throw new Error('Signout failed');
    }
}

async function handleCancelSubscriptionClick({el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction}) {
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

    const identity = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => (res.ok ? res.text() : null));

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
        throw new Error(t('There was an error cancelling your subscription, please try again.'));
    }
}

async function handleContinueSubscriptionClick({el, errorEl, siteUrl, subscriptionId}) {
    const identity = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => (res.ok ? res.text() : null));

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
        throw new Error(t('There was an error continuing your subscription, please try again.'));
    }
}

/* ---------- Main Data Attribute Handler ---------- */

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = event => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            try {
                await handlePlanClick({el, errorEl, siteUrl, site, member});
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                el.classList.add('error');
                return;
            }
            el.classList.remove('loading');
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;

        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            try {
                await handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl});
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                el.classList.add('error');
                return;
            }
            el.classList.remove('loading');
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            try {
                await handleManageBillingClick({el, errorEl, siteUrl, returnUrl});
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                el.classList.add('error');
                return;
            }
            el.classList.remove('loading');
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-signout]').forEach(el => {
        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            try {
                await handleSignoutClick({el, siteUrl});
            } catch {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
            }
        };
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = async event => {
            event.preventDefault();
            const subscriptionId = el.dataset.membersCancelSubscription;
            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');
            if (errorEl) {
                errorEl.innerText = '';
            }
            try {
                await handleCancelSubscriptionClick({el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction});
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                return;
            }
            el.classList.remove('loading');
        };
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = async event => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            const subscriptionId = el.dataset.membersContinueSubscription;
            if (errorEl) {
                errorEl.innerText = '';
            }
            try {
                await handleContinueSubscriptionClick({el, errorEl, siteUrl, subscriptionId});
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                return;
            }
            el.classList.remove('loading');
        };
        el.addEventListener('click', clickHandler);
    });
}