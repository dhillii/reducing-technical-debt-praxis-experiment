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

/**
 * Prepares request data for magic link submission
 */
function prepareMagicLinkRequestData(form, event, wantsOTC) {
    let emailInput = event.target.querySelector('input[data-members-email]');
    let nameInput = event.target.querySelector('input[data-members-name]');
    let autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    let email = emailInput?.value;
    let name = (nameInput?.value || '').trim() || undefined;
    let emailType = form.dataset.membersForm || undefined;
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
    
    const urlHistory = getUrlHistory();
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
    
    return reqBody;
}

/**
 * Handles magic link submission response
 */
async function handleMagicLinkResponse(magicLinkRes, form, errorEl, wantsOTC, email, doAction) {
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
                // eslint-disable-next-line no-console
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
    
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');
    
    try {
        const reqBody = prepareMagicLinkRequestData(form, event, wantsOTC);
        
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
        
        await handleMagicLinkResponse(magicLinkRes, form, errorEl, wantsOTC, reqBody.email, doAction);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

/**
 * Prepares checkout URLs for plan clicks
 */
function prepareCheckoutUrls(el) {
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
    
    return {checkoutSuccessUrl, checkoutCancelUrl};
}

/**
 * Prepares metadata for checkout sessions
 */
function prepareCheckoutMetadata(member) {
    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }
    
    return metadata;
}

/**
 * Handles Stripe redirect checkout flow
 */
async function handleStripeRedirect(responseBody) {
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

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    let plan = el.dataset.membersPlan;
    let requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    
    const {checkoutSuccessUrl, checkoutCancelUrl} = prepareCheckoutUrls(el);

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');
    
    const metadata = prepareCheckoutMetadata(member);

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(function (res) {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(function (identity) {
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
    }).then(function (responseBody) {
        return handleStripeRedirect(responseBody);
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

/**
 * Prepares URLs for billing actions
 */
function prepareBillingUrls(el) {
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

/**
 * Handles edit billing session creation
 */
function handleEditBillingSession(res, siteUrl, identity, successUrl, cancelUrl) {
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

/**
 * Handles edit billing redirect
 */
function handleEditBillingRedirect(result) {
    let stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

/**
 * Handles edit billing redirect result
 */
function handleEditBillingRedirectResult(result) {
    if (result.error) {
        throw new Error(t(result.error.message));
    }
}

/**
 * Sets up edit billing click handler
 */
function setupEditBillingClickHandler(el, siteUrl, errorEl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        el.classList.add('loading');
        
        const {successUrl, cancelUrl} = prepareBillingUrls(el);

        fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        }).then(function (res) {
            if (!res.ok) {
                return null;
            }
            return res.text();
        }).then(function (identity) {
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
                return handleEditBillingSession(res, siteUrl, identity, successUrl, cancelUrl);
            });
        }).then(function (result) {
            return handleEditBillingRedirect(result);
        }).then(function (result) {
            return handleEditBillingRedirectResult(result);
        }).catch(function (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) {
                errorEl.innerText = err.message;
            }
            el.classList.add('error');
        });
    };
}

/**
 * Prepares return URL for manage billing
 */
function prepareManageBillingReturnUrl(el) {
    let membersReturn = el.dataset.membersReturn;
    let returnUrl;

    if (membersReturn) {
        returnUrl = (new URL(membersReturn, window.location.href)).href;
    }
    
    return returnUrl;
}

/**
 * Handles manage billing session creation
 */
function handleManageBillingSession(res) {
    if (!res.ok) {
        throw new Error(t('Could not create Stripe billing portal session'));
    }
    return res.json();
}

/**
 * Handles manage billing redirect
 */
function handleManageBillingRedirect(result) {
    return window.location.assign(result.url);
}

/**
 * Sets up manage billing click handler
 */
function setupManageBillingClickHandler(el, siteUrl, errorEl, clickHandler) {
    return function(event) {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();

        if (errorEl) {
            errorEl.innerText = '';
        }
        el.classList.add('loading');
        
        const returnUrl = prepareManageBillingReturnUrl(el);

        fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin'
        }).then(function (res) {
            if (!res.ok) {
                return null;
            }
            return res.text();
        }).then(function (identity) {
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
                return handleManageBillingSession(res);
            });
        }).then(function (result) {
            return handleManageBillingRedirect(result);
        }).catch(function (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            if (errorEl) {
                errorEl.innerText = err.message;
            }
            el.classList.add('error');
        });
    };
}

/**
 * Sets up signout click handler
 */
function setupSignoutClickHandler(el, siteUrl, clickHandler) {
    return function(event) {
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
    };
}

/**
 * Checks if retention offers are available
 */
function hasRetentionOffers(offers) {
    return (offers || []).some(offer => offer.redemption_type === 'retention');
}

/**
 * Handles subscription cancellation with retention offers
 */
function handleSubscriptionCancellationWithOffers(subscriptionId, doAction) {
    doAction('openPopup', {
        page: 'accountPlan',
        pageData: {
            subscriptionId,
            action: 'cancel'
        }
    });
}

/**
 * Handles subscription cancellation API call
 */
function handleSubscriptionCancellationApiCall(res, siteUrl, identity, subscriptionId) {
    if (!res.ok) {
        return null;
    }
    return res.text();
}

/**
 * Handles subscription cancellation update
 */
function handleSubscriptionCancellationUpdate(res, subscriptionId) {
    if (!res.ok) {
        return null;
    }
    return res.text();
}

/**
 * Handles subscription cancellation success
 */
function handleSubscriptionCancellationSuccess(res, el, clickHandler, errorEl) {
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

/**
 * Sets up cancel subscription click handler
 */
function setupCancelSubscriptionClickHandler(el, siteUrl, errorEl, clickHandler, offers, doAction) {
    return function(event) {
        event.preventDefault();

        let subscriptionId = el.dataset.membersCancelSubscription;

        // If retention offer is available, open Portal to show the offer
        if (hasRetentionOffers(offers)) {
            handleSubscriptionCancellationWithOffers(subscriptionId, doAction);
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
            return handleSubscriptionCancellationApiCall(res, siteUrl, identity, subscriptionId);
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
            return handleSubscriptionCancellationSuccess(res, el, clickHandler, errorEl);
        });
    };
}

/**
 * Handles continue subscription API call
 */
function handleContinueSubscriptionApiCall(res, siteUrl, identity, subscriptionId) {
    if (!res.ok) {
        return null;
    }
    return res.text();
}

/**
 * Handles continue subscription update
 */
function handleContinueSubscriptionUpdate(res, subscriptionId) {
    if (!res.ok) {
        return null;
    }
    return res.text();
}

/**
 * Handles continue subscription success
 */
function handleContinueSubscriptionSuccess(res, el, clickHandler, errorEl) {
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

/**
 * Sets up continue subscription click handler
 */
function setupContinueSubscriptionClickHandler(el, siteUrl, errorEl, clickHandler) {
    return function(event) {
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
            return handleContinueSubscriptionApiCall(res, siteUrl, identity, subscriptionId);
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
            return handleContinueSubscriptionSuccess(res, el, clickHandler, errorEl);
        });
    };
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
        const clickHandler = setupEditBillingClickHandler(el, siteUrl, errorEl, clickHandler);
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        let errorEl = el.querySelector('[data-members-error]');
        const clickHandler = setupManageBillingClickHandler(el, siteUrl, errorEl, clickHandler);
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        const clickHandler = setupSignoutClickHandler(el, siteUrl, clickHandler);
        el.addEventListener('click', clickHandler);
    });

    const hasRetention = hasRetentionOffers(offers);

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = setupCancelSubscriptionClickHandler(el, siteUrl, errorEl, clickHandler, offers, doAction);
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        let errorEl = el.parentElement.querySelector('[data-members-error]');
        const clickHandler = setupContinueSubscriptionClickHandler(el, siteUrl, errorEl, clickHandler);
        el.addEventListener('click', clickHandler);
    });
}