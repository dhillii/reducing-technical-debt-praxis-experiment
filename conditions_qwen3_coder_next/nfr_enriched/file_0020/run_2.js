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

function extractLabels(event) {
    const labelInputs = event.target.querySelectorAll('input[data-members-label]');
    const labels = [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

function extractNewsletters(event) {
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked');
    const newsletters = [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return newsletters;
}

function determineEmailType(form) {
    return form?.dataset?.membersForm;
}

function shouldRequestOTC(form) {
    return form?.dataset?.membersForm === 'signin' && form?.dataset?.membersOtc === 'true';
}

function buildRequestPayload(email, name, emailType, labels, newsletters, autoRedirect, wantsOTC, urlHistory) {
    const reqBody = {
        email,
        emailType,
        labels,
        name: name || undefined,
        autoRedirect: (autoRedirect === 'true')
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

    return reqBody;
}

function extractRequestDataFromForm(event, form) {
    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const labels = extractLabels(event);
    const newsletters = extractNewsletters(event);
    const emailType = determineEmailType(form);
    const wantsOTC = shouldRequestOTC(form);
    const urlHistory = getUrlHistory();

    return {
        email,
        name,
        emailType,
        labels,
        newsletters,
        autoRedirect,
        wantsOTC,
        urlHistory
    };
}

async function sendMagicLink({siteUrl, reqBody, form, submitHandler, errorEl, doAction, captureException, wantsOTC}) {
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
            if (otcRef && typeof doAction === 'function') {
                try {
                    doAction('startSigninOTCFromCustomForm', {
                        email: (reqBody.email || '').trim(),
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

    const {
        email,
        name,
        emailType,
        labels,
        newsletters,
        autoRedirect,
        wantsOTC,
        urlHistory
    } = extractRequestDataFromForm(event, form);

    const reqBody = buildRequestPayload(email, name, emailType, labels, newsletters, autoRedirect, wantsOTC, urlHistory);

    await sendMagicLink({
        siteUrl,
        reqBody,
        form,
        submitHandler,
        errorEl,
        doAction,
        captureException,
        wantsOTC
    });
}

function createCheckoutSession({siteUrl, requestData, successUrl, cancelUrl, metadata, identity}) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity,
            successUrl,
            cancelUrl,
            metadata
        })
    }).then(function (res) {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

function handleCheckoutResponse(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }

    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    }).then(function (redirectResult) {
        if (redirectResult.error) {
            throw new Error(redirectResult.error.message);
        }
    });
}

function handleCheckoutError(err, el, clickHandler, errorEl) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;

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

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
        return createCheckoutSession({
            siteUrl,
            requestData,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata,
            identity
        });
    }).then(function (responseBody) {
        return handleCheckoutResponse(responseBody);
    }).catch(function (err) {
        handleCheckoutError(err, el, clickHandler, errorEl);
    });
}

function createUpdateSession({siteUrl, successUrl, cancelUrl, identity}) {
    return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity,
            successUrl,
            cancelUrl
        })
    }).then(function (res) {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

function handleUpdateSessionResponse(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

function handleUpdateSessionError(err, el, clickHandler, errorEl) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

function createBillingPortalSession({siteUrl, returnUrl, identity}) {
    return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity,
            returnUrl
        })
    }).then(function (res) {
        if (!res.ok) {
            throw new Error(t('Could not create Stripe billing portal session'));
        }
        return res.json();
    });
}

function handleBillingPortalResponse(result) {
    return window.location.assign(result.url);
}

function handleBillingPortalError(err, el, clickHandler, errorEl) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

function handleSignoutResponse(res, siteUrl, el, clickHandler) {
    if (res.ok) {
        window.location.replace(siteUrl);
    } else {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
    }
}

function handleCancelSubscriptionResponse(res, el, errorEl, clickHandler) {
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
}

function handleContinueSubscriptionResponse(res, el, errorEl, clickHandler) {
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
}

function createSubscriptionUpdateRequest({siteUrl, subscriptionId, identity, payload}) {
    return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            identity,
            ...payload
        })
    });
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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }
                return res.text();
            }).then(function (identity) {
                return createUpdateSession({siteUrl, successUrl, cancelUrl, identity});
            }).then(function (result) {
                return handleUpdateSessionResponse(result);
            }).catch(function (err) {
                handleUpdateSessionError(err, el, clickHandler, errorEl);
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }
                return res.text();
            }).then(function (identity) {
                return createBillingPortalSession({siteUrl, returnUrl, identity});
            }).then(function (result) {
                return handleBillingPortalResponse(result);
            }).catch(function (err) {
                handleBillingPortalError(err, el, clickHandler, errorEl);
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
            }).then(function (res) {
                handleSignoutResponse(res, siteUrl, el, clickHandler);
            });
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
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

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }
                return res.text();
            }).then(function (identity) {
                return createSubscriptionUpdateRequest({
                    siteUrl,
                    subscriptionId,
                    identity,
                    payload: {smart_cancel: true}
                });
            }).then(function (res) {
                handleCancelSubscriptionResponse(res, el, errorEl, clickHandler);
            });
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            const subscriptionId = el.dataset.membersContinueSubscription;

            if (errorEl) {
                errorEl.innerText = '';
            }

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(function (res) {
                if (!res.ok) {
                    return null;
                }
                return res.text();
            }).then(function (identity) {
                return createSubscriptionUpdateRequest({
                    siteUrl,
                    subscriptionId,
                    identity,
                    payload: {cancel_at_period_end: false}
                });
            }).then(function (res) {
                handleContinueSubscriptionResponse(res, el, errorEl, clickHandler);
            });
        }
        el.addEventListener('click', clickHandler);
    });
}