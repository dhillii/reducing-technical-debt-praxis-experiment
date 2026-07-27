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

function getFormRequestData(event, form) {
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

    return reqBody;
}

async function sendMagicLinkRequest(siteUrl, reqBody) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    const integrityToken = await integrityTokenRes.text();

    const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });

    return magicLinkRes;
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
                    email: (form.querySelector('input[data-members-email]')?.value || '').trim(),
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

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');
    form.classList.add('loading');
    const reqBody = getFormRequestData(event, form);
    try {
        const magicLinkRes = await sendMagicLinkRequest(siteUrl, reqBody);
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        await handleMagicLinkResponse(magicLinkRes, form, errorEl, reqBody.includeOTC, doAction);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

function getPlanRequestData(el, site, member) {
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

    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return {requestData, checkoutSuccessUrl, checkoutCancelUrl, metadata};
}

async function createStripeCheckoutSession(siteUrl, identity, requestData, successUrl, cancelUrl, metadata) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...requestData,
            identity: identity,
            successUrl: successUrl,
            cancelUrl: cancelUrl,
            metadata
        })
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

async function handlePlanClickResponse(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }
    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    const {requestData, checkoutSuccessUrl, checkoutCancelUrl, metadata} = getPlanRequestData(el, site, member);

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
        return createStripeCheckoutSession(siteUrl, identity, requestData, checkoutSuccessUrl, checkoutCancelUrl, metadata);
    }).then(function (responseBody) {
        return handlePlanClickResponse(responseBody);
    }).catch(function (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    });
}

function getEditBillingRequestData(el) {
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

    return {successUrl, cancelUrl};
}

async function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            successUrl: successUrl,
            cancelUrl: cancelUrl
        })
    });

    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }

    return res.json();
}

export function handleEditBillingClick({event, el, errorEl, siteUrl}) {
    el.removeEventListener('click', event => handleEditBillingClick({event, el, errorEl, siteUrl}));
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    const {successUrl, cancelUrl} = getEditBillingRequestData(el);

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
        return createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl);
    }).then(function (result) {
        let stripe = window.Stripe(result.publicKey);
        return stripe.redirectToCheckout({
            sessionId: result.sessionId
        });
    }).then(function (result) {
        if (result.error) {
            throw new Error(t(result.error.message));
        }
    }).catch(function (err) {
        console.error(err);
        el.addEventListener('click', event => handleEditBillingClick({event, el, errorEl, siteUrl}));
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    });
}

function getManageBillingRequestData(el) {
    let membersReturn = el.dataset.membersReturn;
    let returnUrl;

    if (membersReturn) {
        returnUrl = (new URL(membersReturn, window.location.href)).href;
    }

    return {returnUrl};
}

async function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
    const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identity: identity,
            returnUrl
        })
    });

    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }

    return res.json();
}

export function handleManageBillingClick({event, el, errorEl, siteUrl}) {
    el.removeEventListener('click', event => handleManageBillingClick({event, el, errorEl, siteUrl}));
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    const {returnUrl} = getManageBillingRequestData(el);

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
        return createStripeBillingPortalSession(siteUrl, identity, returnUrl);
    }).then(function (result) {
        return window.location.assign(result.url);
    }).catch(function (err) {
        console.error(err);
        el.addEventListener('click', event => handleManageBillingClick({event, el, errorEl, siteUrl}));
        el.classList.remove('loading');
        if (errorEl) {
            errorEl.innerText = err.message;
        }
        el.classList.add('error');
    });
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
        function clickHandler(event) {
            handleEditBillingClick({event, el, errorEl, siteUrl});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleManageBillingClick({event, el, errorEl, siteUrl});
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
            }).then(function (res) {
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

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            event.preventDefault();

            let subscriptionId = el.dataset.membersCancelSubscription;

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

            return fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }

                return res.text();
            }).then(function (identity) {
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
            }).then(function (res) {
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

            return fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }

                return res.text();
            }).then(function (identity) {
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
            }).then(function (res) {
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
    });
}