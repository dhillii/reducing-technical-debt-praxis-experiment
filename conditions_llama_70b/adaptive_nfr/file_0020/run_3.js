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

function isResponseOk(res) {
    return res.ok;
}

function getResponseText(res) {
    return res.text();
}

function getResponseJson(res) {
    return res.json();
}

function getIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(getResponseText);
}

function createStripeCheckoutSession(siteUrl, requestData) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    });
}

function createStripeUpdateSession(siteUrl, requestData) {
    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    });
}

function createStripeBillingPortalSession(siteUrl, requestData) {
    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    });
}

function redirectToCheckout(stripe, sessionId) {
    return stripe.redirectToCheckout({
        sessionId: sessionId
    });
}

function isRetentionOfferAvailable(offers) {
    return (offers || []).some(offer => offer.redemption_type === 'retention');
}

function openPopup(doAction, pageData) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: pageData
    });
}

function cancelSubscription(siteUrl, subscriptionId, identity) {
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            smart_cancel: true
        })
    });
}

function continueSubscription(siteUrl, subscriptionId, identity) {
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            cancel_at_period_end: false
        })
    });
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
        newsletters.push({name: newsletterInputs[i].value});
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
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];

        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        if (!isResponseOk(integrityTokenRes)) {
            throw new Error(t('Could not get integrity token'));
        }
        const integrityToken = await getResponseText(integrityTokenRes);

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });
        if (!isResponseOk(magicLinkRes)) {
            throw new Error(t('Could not send magic link email'));
        }

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        form.classList.add('success');

        let responseBody;
        if (wantsOTC) {
            try {
                responseBody = await getResponseJson(magicLinkRes.clone());
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
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

export async function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    let plan = el.dataset.membersPlan;
    let requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    let successUrl = el.dataset.membersSuccess;
    let cancelUrl = el.dataset.membersCancel;
    let checkoutSuccessUrl;
    let checkoutCancelUrl;

    if (successUrl) {
        checkoutSuccessUrl = (new URL(successUrl, window.location.href)).href;
    }

    if (cancelUrl) {
        checkoutCancelUrl = (new URL(cancelUrl, window.location.href)).href;
    }

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    try {
        const identity = await getIdentity(siteUrl);
        const res = await createStripeCheckoutSession(siteUrl, {
            ...requestData,
            identity: identity,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata
        });
        if (!isResponseOk(res)) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        const responseBody = await getResponseJson(res);
        if (responseBody.url) {
            return window.location.assign(responseBody.url);
        }
        const stripe = window.Stripe(responseBody.publicKey);
        await redirectToCheckout(stripe, responseBody.sessionId);
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

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    Array.prototype.forEach.call(document.querySelectorAll('form[data-members-form]'), function (form) {
        let errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-plan]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-edit-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        let membersSuccess = el.dataset.membersSuccess;
        let membersCancel = el.dataset.membersCancel;
        let successUrl;
        let cancelUrl;

        if (membersSuccess) {
            successUrl = (new URL(membersSuccess, window.location.href)).href;
        }

        if (membersCancel) {
            cancelUrl = (new URL(membersCancel, window.location.href)).href;
        }

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            getIdentity(siteUrl).then(identity => {
                return createStripeUpdateSession(siteUrl, {
                    identity: identity,
                    successUrl: successUrl,
                    cancelUrl: cancelUrl
                });
            }).then(res => {
                if (!isResponseOk(res)) {
                    throw new Error(t('Could not create stripe update session'));
                }
                return getResponseJson(res);
            }).then(result => {
                let stripe = window.Stripe(result.publicKey);
                return redirectToCheckout(stripe, result.sessionId);
            }).catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                el.classList.add('error');
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        let membersReturn = el.dataset.membersReturn;
        let returnUrl;

        if (membersReturn) {
            returnUrl = (new URL(membersReturn, window.location.href)).href;
        }

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');
            getIdentity(siteUrl).then(identity => {
                return createStripeBillingPortalSession(siteUrl, {
                    identity: identity,
                    returnUrl: returnUrl
                });
            }).then(res => {
                if (!isResponseOk(res)) {
                    throw new Error(t('Could not create Stripe billing portal session'));
                }
                return getResponseJson(res);
            }).then(result => {
                return window.location.assign(result.url);
            }).catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                if (errorEl) {
                    errorEl.innerText = err.message;
                }
                el.classList.add('error');
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            fetch(`${siteUrl}/members/api/session`, {
                method: 'DELETE'
            }).then(res => {
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
    });

    const hasRetentionOffers = isRetentionOfferAvailable(offers);

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            event.preventDefault();

            let subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                openPopup(doAction, {
                    subscriptionId,
                    action: 'cancel'
                });

                return;
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            getIdentity(siteUrl).then(identity => {
                return cancelSubscription(siteUrl, subscriptionId, identity);
            }).then(res => {
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
            }).catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');

                if (errorEl) {
                    errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                }
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            let subscriptionId = el.dataset.membersContinueSubscription;

            if (errorEl) {
                errorEl.innerText = '';
            }

            getIdentity(siteUrl).then(identity => {
                return continueSubscription(siteUrl, subscriptionId, identity);
            }).then(res => {
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
            }).catch(err => {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');

                if (errorEl) {
                    errorEl.innerText = t('There was an error continuing your subscription, please try again.');
                }
            });
        }
        el.addEventListener('click', clickHandler);
    });
}