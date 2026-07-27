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

async function createStripeCheckoutSession(siteUrl, requestData, successUrl, cancelUrl, metadata) {
    const response = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    const identity = await response.text();

    const checkoutResponse = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        })
    });

    if (!checkoutResponse.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return await checkoutResponse.json();
}

async function redirectToCheckout(responseBody) {
    const stripe = window.Stripe(responseBody.publicKey);
    const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });

    if (redirectResult.error) {
        throw new Error(redirectResult.error.message);
    }
}

async function handlePlanClick(el, errorEl, siteUrl, site, member, clickHandler) {
    el.removeEventListener('click', clickHandler);
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : null;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : null;
    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const responseBody = await createStripeCheckoutSession(siteUrl, requestData, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        if (responseBody.url) {
            window.location.assign(responseBody.url);
        } else {
            await redirectToCheckout(responseBody);
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

async function handleEditBillingClick(el, errorEl, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    const membersSuccess = el.dataset.membersSuccess;
    const membersCancel = el.dataset.membersCancel;
    const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : null;
    const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : null;

    try {
        const response = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!response.ok) {
            throw new Error(t('Could not create stripe update session'));
        }

        const identity = await response.text();

        const updateResponse = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
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

        if (!updateResponse.ok) {
            throw new Error(t('Could not create stripe update session'));
        }

        const responseBody = await updateResponse.json();
        const stripe = window.Stripe(responseBody.publicKey);
        await stripe.redirectToCheckout({
            sessionId: responseBody.sessionId
        });
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

async function handleManageBillingClick(el, errorEl, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    const membersReturn = el.dataset.membersReturn;
    const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : null;

    try {
        const response = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!response.ok) {
            throw new Error(t('Could not create stripe billing portal session'));
        }

        const identity = await response.text();

        const portalResponse = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                returnUrl
            })
        });

        if (!portalResponse.ok) {
            throw new Error(t('Could not create stripe billing portal session'));
        }

        const responseBody = await portalResponse.json();
        window.location.assign(responseBody.url);
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

async function handleSignoutClick(el, clickHandler) {
    el.removeEventListener('click', clickHandler);
    try {
        const response = await fetch(`${siteUrl}/members/api/session`, {
            method: 'DELETE'
        });

        if (response.ok) {
            window.location.replace(siteUrl);
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

async function handleCancelSubscriptionClick(el, errorEl, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    const subscriptionId = el.dataset.membersCancelSubscription;

    try {
        const response = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!response.ok) {
            throw new Error(t('Could not cancel subscription'));
        }

        const identity = await response.text();

        const cancelResponse = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                smart_cancel: true
            })
        });

        if (cancelResponse.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');

            if (errorEl) {
                errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
        }
    }
}

async function handleContinueSubscriptionClick(el, errorEl, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    const subscriptionId = el.dataset.membersContinueSubscription;

    try {
        const response = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        });

        if (!response.ok) {
            throw new Error(t('Could not continue subscription'));
        }

        const identity = await response.text();

        const continueResponse = await fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identity,
                cancel_at_period_end: false
            })
        });

        if (continueResponse.ok) {
            window.location.reload();
        } else {
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            el.classList.add('error');

            if (errorEl) {
                errorEl.innerText = t('There was an error continuing your subscription, please try again.');
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');

        if (errorEl) {
            errorEl.innerText = t('There was an error continuing your subscription, please try again.');
        }
    }
}

export async function formSubmitHandler(
    { event, form, errorEl, siteUrl, submitHandler, doAction, captureException }
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');
    let emailInput = event.target.querySelector('input[data-members-email]');
    let nameInput = event.target.querySelector('input[data-members-name]');
    let autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    let email = emailInput?.value;
    let name = (nameInput?.value || '').trim() || undefined;
    let emailType = undefined;
    let labels = [];
    let newsletters = [];

    let labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }

    let newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({ name: newsletterInputs[i].value });
    }

    if (form.dataset.membersForm) {
        emailType = form.dataset.membersForm;
    }

    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: (autoRedirect === 'true')
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
        // If there was only check-able newsletter inputs in the form, but none were checked, set reqBody.newsletters
        // to an empty array so that the member is not signed up to the default newsletters
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];

        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, { method: 'GET' });
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...reqBody, integrityToken })
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
            form.classList.add('error'); // Ensure error state is set here
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

export function planClickHandler({ event, el, errorEl, siteUrl, site, member, clickHandler }) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    handlePlanClick(el, errorEl, siteUrl, site, member, clickHandler);
}

export function handleDataAttributes({ siteUrl, site = {}, member, offers = [], doAction, captureException } = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        let errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({ event, errorEl, form, siteUrl, submitHandler, doAction, captureException });
        }
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({ el, event, errorEl, member, site, siteUrl, clickHandler });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleEditBillingClick(el, errorEl, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleManageBillingClick(el, errorEl, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(el, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            event.preventDefault();

            let subscriptionId = el.dataset.membersCancelSubscription;

            // If retention offer is available, open Portal to show the offer
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

            handleCancelSubscriptionClick(el, errorEl, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleContinueSubscriptionClick(el, errorEl, siteUrl, clickHandler);
        }
        el.addEventListener('click', clickHandler);
    });
}