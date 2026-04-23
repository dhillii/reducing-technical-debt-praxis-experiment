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

function collectFormLabels(event) {
    const labels = [];
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

function collectFormNewsletters(event) {
    const newsletters = [];
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return newsletters;
}

function buildRequestBody(email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs, event, urlHistory) {
    const reqBody = {
        email: email,
        emailType: emailType,
        labels: labels,
        name: name,
        autoRedirect: (autoRedirect === 'true')
    };
    
    if (emailType === 'signin') {
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

async function handleMagicLinkResponse(magicLinkRes, form, errorEl, email, wantsOTC, doAction, captureException) {
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
    
    let emailInput = event.target.querySelector('input[data-members-email]');
    let nameInput = event.target.querySelector('input[data-members-name]');
    let autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    let email = emailInput?.value;
    let name = (nameInput?.value || '').trim() || undefined;
    let emailType = form.dataset.membersForm || undefined;
    
    const labels = collectFormLabels(event);
    const newsletters = collectFormNewsletters(event);
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, newsletters, newsletterInputs, event, urlHistory);

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        await handleMagicLinkResponse(magicLinkRes, form, errorEl, email, wantsOTC, doAction, captureException);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

function handleCheckoutSessionResponse(responseBody) {
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

function handlePlanClickError(err, el, errorEl, clickHandler) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

function fetchSessionIdentity(siteUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    });
}

function createCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...requestData,
            identity: identity,
            successUrl: checkoutSuccessUrl,
            cancelUrl: checkoutCancelUrl,
            metadata
        })
    }).then(function (res) {
        if (!res.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }
        return res.json();
    });
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
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

    return fetchSessionIdentity(siteUrl)
        .then(function (identity) {
            return createCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata);
        })
        .then(function (responseBody) {
            return handleCheckoutSessionResponse(responseBody);
        })
        .catch(function (err) {
            handlePlanClickError(err, el, errorEl, clickHandler);
        });
}

function handleEditBillingClick(el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    
    return fetchSessionIdentity(siteUrl)
        .then(function (identity) {
            return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: identity,
                    successUrl: successUrl,
                    cancelUrl: cancelUrl
                })
            }).then(function (res) {
                if (!res.ok) {
                    throw new Error(t('Could not create stripe checkout session'));
                }
                return res.json();
            });
        })
        .then(function (result) {
            let stripe = window.Stripe(result.publicKey);
            return stripe.redirectToCheckout({
                sessionId: result.sessionId
            });
        })
        .then(function (result) {
            if (result.error) {
                throw new Error(t(result.error.message));
            }
        })
        .catch(function (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) {
                errorEl.innerText = err.message;
            }
            el.classList.add('error');
        });
}

function handleManageBillingClick(el, errorEl, siteUrl, returnUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    
    return fetchSessionIdentity(siteUrl)
        .then(function (identity) {
            return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: identity,
                    returnUrl
                })
            }).then(function (res) {
                if (!res.ok) {
                    throw new Error(t('Could not create Stripe billing portal session'));
                }
                return res.json();
            });
        })
        .then(function (result) {
            return window.location.assign(result.url);
        })
        .catch(function (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) {
                errorEl.innerText = err.message;
            }
            el.classList.add('error');
        });
}

function handleSignoutClick(el, siteUrl, clickHandler) {
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

function handleCancelSubscriptionClick(el, errorEl, siteUrl, hasRetentionOffers, doAction, clickHandler) {
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

    return fetchSessionIdentity(siteUrl)
        .then(function (identity) {
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
        })
        .then(function (res) {
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

function handleContinueSubscriptionClick(el, errorEl, siteUrl, clickHandler) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    el.classList.remove('error');
    el.classList.add('loading');

    let subscriptionId = el.dataset.membersContinueSubscription;

    if (errorEl) {
        errorEl.innerText = '';
    }

    return fetchSessionIdentity(siteUrl)
        .then(function (identity) {
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
        })
        .then(function (res) {
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
            handleEditBillingClick(el, errorEl, siteUrl, successUrl, cancelUrl, clickHandler);
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
            handleManageBillingClick(el, errorEl, siteUrl, returnUrl, clickHandler);
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
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleCancelSubscriptionClick(el, errorEl, siteUrl, hasRetentionOffers, doAction, clickHandler);
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
```