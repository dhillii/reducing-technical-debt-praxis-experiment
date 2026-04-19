```javascript
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

function extractFormInputs(event) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = event.target.dataset.membersAutoredirect || 'true';

    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;

    return {email, name, autoRedirect};
}

function extractLabels(event) {
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    return Array.from(labelInputs).map(input => input.value);
}

function extractNewsletters(event) {
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    return Array.from(newsletterInputs).map(input => ({name: input.value}));
}

function extractCheckableNewsletters(event) {
    const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return Array.from(checkableNewsletterInputs);
}

function buildRequestBody({email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters}) {
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

function checkableNewsletterInputsLength(event) {
    const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkableNewsletterInputs.length > 0;
}

function newsletterInputsLength(event) {
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    return newsletterInputs.length > 0;
}

function wantsOTC(emailType, membersOtc) {
    return emailType === 'signin' && membersOtc === 'true';
}

function handleMagicLinkSuccess(responseBody, otcRef, doAction, email, captureException) {
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

function handleMagicLinkError(magicLinkRes, errorEl) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
    return false;
}

export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    form.classList.remove('success', 'invalid', 'error');

    const {email, name, autoRedirect} = extractFormInputs(event);
    const labels = extractLabels(event);
    const newsletters = extractNewsletters(event);
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = wantsOTC(emailType, form?.dataset?.membersOtc);

    form.classList.add('loading');
    const urlHistory = getUrlHistory();

    const reqBody = buildRequestBody({
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters
    });

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
                } catch (e) {
                    responseBody = undefined;
                }
            }

            const otcRef = responseBody?.otc_ref;
            handleMagicLinkSuccess(responseBody, otcRef, doAction, email, captureException);
        } else {
            await handleMagicLinkError(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

function buildCheckoutUrls(successUrl, cancelUrl) {
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;
    return {checkoutSuccessUrl, checkoutCancelUrl};
}

function buildCheckoutMetadata(member, urlHistory) {
    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return metadata;
}

function handlePlanClickError(err, el, errorEl) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const {successUrl, cancelUrl} = el.dataset;
    const {checkoutSuccessUrl, checkoutCancelUrl} = buildCheckoutUrls(successUrl, cancelUrl);

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');
    const urlHistory = getUrlHistory();
    const metadata = buildCheckoutMetadata(member, urlHistory);

    const identityRes = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });

    if (!identityRes.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const identity = await identityRes.text();

    const sessionRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata
        })
    });

    if (!sessionRes.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const responseBody = await sessionRes.json();

    if (responseBody.url) {
        window.location.assign(responseBody.url);
    } else {
        const stripe = window.Stripe(responseBody.publicKey);
        await stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        });
    }
}

function handleEditBillingClick({el, errorEl, siteUrl, successUrl, cancelUrl, member, doAction, captureException}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });

    if (!identityRes.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const identity = await identityRes.text();

    const sessionRes = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity,
            successUrl,
            cancelUrl
        })
    });

    if (!sessionRes.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const result = await sessionRes.json();
    const stripe = window.Stripe(result.publicKey);
    await stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

function handleManageBillingClick({el, errorEl, siteUrl, returnUrl, member, doAction, captureException}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }

    el.classList.add('loading');

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });

    if (!identityRes.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    const identity = await identityRes.text();

    const sessionRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity,
            returnUrl
        })
    });

    if (!sessionRes.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    const result = await sessionRes.json();
    window.location.assign(result.url);
}

function handleSignoutClick({el, siteUrl, errorEl}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    const sessionRes = fetch(`${siteUrl}/members/api/session`, {
        method: 'DELETE'
    });

    if (!sessionRes.ok) {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    } else {
        window.location.replace(siteUrl);
    }
}

function handleCancelSubscriptionClick({el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction, captureException}) {
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

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });

    if (!identityRes.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const identity = await identityRes.text();

    const sessionRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity,
            smart_cancel: true
        })
    });

    if (sessionRes.ok) {
        window.location.reload();
    } else {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
        }
    }
}

function handleContinueSubscriptionClick({el, errorEl, siteUrl, subscriptionId, doAction, captureException}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    if (errorEl) {
        errorEl.innerText = '';
    }

    const identityRes = fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });

    if (!identityRes.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const identity = await identityRes.text();

    const sessionRes = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity,
            cancel_at_period_end: false
        })
    });

    if (sessionRes.ok) {
        window.location.reload();
    } else {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = t('There was an error continuing your subscription, please try again.');
        }
    }
}

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
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const {checkoutSuccessUrl, checkoutCancelUrl} = buildCheckoutUrls(membersSuccess, membersCancel);

        function clickHandler(event) {
            handleEditBillingClick({el, errorEl, siteUrl, successUrl: checkoutSuccessUrl, cancelUrl: checkoutCancelUrl, member, doAction, captureException});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

        function clickHandler(event) {
            handleManageBillingClick({el, errorEl, siteUrl, returnUrl, member, doAction, captureException});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick({el, siteUrl, errorEl: el.querySelector('[data-members-error]')});
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleCancelSubscriptionClick({el, errorEl, siteUrl, subscriptionId: el.dataset.membersCancelSubscription, hasRetentionOffers, doAction, captureException});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleContinueSubscriptionClick({el, errorEl, siteUrl, subscriptionId: el.dataset.membersContinueSubscription, doAction, captureException});
        }
        el.addEventListener('click', clickHandler);
    });
}
```