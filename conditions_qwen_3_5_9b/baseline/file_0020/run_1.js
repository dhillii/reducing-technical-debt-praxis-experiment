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

function getNewsletterInputs(eventTarget) {
    const newsletterInputs = eventTarget.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    ) || [];
    
    return newsletterInputs.map(input => ({name: input.value}));
}

function getCheckableNewsletterInputs(eventTarget) {
    return eventTarget.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
}

function buildRequestBody(eventTarget, form, email, name, labels, newsletters, emailType, wantsOTC, urlHistory) {
    const reqBody = {
        email,
        emailType,
        labels,
        name: name || undefined,
        autoRedirect: true
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
        const checkableNewsletterInputs = getCheckableNewsletterInputs(eventTarget);
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }
    
    return reqBody;
}

export async function formSubmitHandler({event, form, errorEl, siteUrl, submitHandler, doAction, captureException}) {
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
    const emailType = form.dataset.membersForm || undefined;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    const labels = Array.from(labelInputs).map(input => input.value);
    const newsletters = getNewsletterInputs(event.target);
    
    form.classList.add('loading');
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestBody(event.target, form, email, name, labels, newsletters, emailType, wantsOTC, urlHistory);
    
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

function getCheckoutUrls(el) {
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
    
    return {checkoutSuccessUrl, checkoutCancelUrl};
}

function getMetadata(member, urlHistory) {
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }
    
    return metadata;
}

async function createCheckoutSession(siteUrl, requestData, identity, successUrl, cancelUrl, metadata) {
    const sessionRes = await fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'});
    
    if (!sessionRes.ok) {
        return null;
    }
    
    const identityText = await sessionRes.text();
    
    const sessionRes2 = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            ...requestData,
            identity: identityText,
            successUrl,
            cancelUrl,
            metadata
        })
    });
    
    if (!sessionRes2.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    
    return sessionRes2.json();
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const {checkoutSuccessUrl, checkoutCancelUrl} = getCheckoutUrls(el);
    
    if (errorEl) {
        errorEl.innerText = '';
    }
    
    el.classList.add('loading');
    const urlHistory = getUrlHistory();
    const metadata = getMetadata(member, urlHistory);
    
    createCheckoutSession(siteUrl, requestData, null, checkoutSuccessUrl, checkoutCancelUrl, metadata)
        .then(responseBody => {
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        })
        .then(redirectResult => {
            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
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
}

function createBillingSession(siteUrl, identity, successUrl, cancelUrl) {
    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => {
            if (!res.ok) {
                return null;
            }
            return res.text();
        })
        .then(identity => {
            return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    successUrl,
                    cancelUrl
                })
            })
            .then(res => {
                if (!res.ok) {
                    throw new Error(t('Could not create stripe checkout session'));
                }
                return res.json();
            });
        });
}

function createBillingPortalSession(siteUrl, identity, returnUrl) {
    return fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => {
            if (!res.ok) {
                return null;
            }
            return res.text();
        })
        .then(identity => {
            return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    returnUrl
                })
            })
            .then(res => {
                if (!res.ok) {
                    throw new Error(t('Could not create Stripe billing portal session'));
                }
                return res.json();
            });
        });
}

function handleBillingEditClick(el, errorEl, siteUrl, successUrl, cancelUrl) {
    el.removeEventListener('click', () => {});
    event.preventDefault();
    
    if (errorEl) {
        errorEl.innerText = '';
    }
    
    el.classList.add('loading');
    
    createBillingSession(siteUrl, null, successUrl, cancelUrl)
        .then(result => {
            const stripe = window.Stripe(result.publicKey);
            return stripe.redirectToCheckout({sessionId: result.sessionId});
        })
        .then(result => {
            if (result.error) {
                throw new Error(t(result.error.message));
            }
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', () => {});
            el.classList.remove('loading');
            
            if (errorEl) {
                errorEl.innerText = err.message;
            }
            
            el.classList.add('error');
        });
}

function handleManageBillingClick(el, errorEl, siteUrl, returnUrl) {
    el.removeEventListener('click', () => {});
    event.preventDefault();
    
    if (errorEl) {
        errorEl.innerText = '';
    }
    
    el.classList.add('loading');
    
    createBillingPortalSession(siteUrl, null, returnUrl)
        .then(result => {
            return window.location.assign(result.url);
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', () => {});
            el.classList.remove('loading');
            
            if (errorEl) {
                errorEl.innerText = err.message;
            }
            
            el.classList.add('error');
        });
}

function handleSignoutClick(el, siteUrl) {
    el.removeEventListener('click', () => {});
    event.preventDefault();
    
    el.classList.remove('error');
    el.classList.add('loading');
    
    fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'})
        .then(res => {
            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', () => {});
                el.classList.remove('loading');
                el.classList.add('error');
            }
        });
}

function handleCancelSubscriptionClick(el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction) {
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
    
    el.removeEventListener('click', () => {});
    el.classList.remove('error');
    el.classList.add('loading');
    
    if (errorEl) {
        errorEl.innerText = '';
    }
    
    fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => {
            if (!res.ok) {
                return null;
            }
            return res.text();
        })
        .then(identity => {
            return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    smart_cancel: true
                })
            });
        })
        .then(res => {
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', () => {});
                el.classList.remove('loading');
                el.classList.add('error');
                
                if (errorEl) {
                    errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                }
            }
        });
}

function handleContinueSubscriptionClick(el, errorEl, siteUrl, subscriptionId) {
    el.removeEventListener('click', () => {});
    event.preventDefault();
    
    el.classList.remove('error');
    el.classList.add('loading');
    
    if (errorEl) {
        errorEl.innerText = '';
    }
    
    fetch(`${siteUrl}/members/api/session`, {credentials: 'same-origin'})
        .then(res => {
            if (!res.ok) {
                return null;
            }
            return res.text();
        })
        .then(identity => {
            return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    identity,
                    cancel_at_period_end: false
                })
            });
        })
        .then(res => {
            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', () => {});
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
            successUrl = new URL(membersSuccess, window.location.href).href;
        }
        
        if (membersCancel) {
            cancelUrl = new URL(membersCancel, window.location.href).href;
        }
        
        function clickHandler(event) {
            handleBillingEditClick(el, errorEl, siteUrl, successUrl, cancelUrl);
        }
        
        el.addEventListener('click', clickHandler);
    });
    
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        let returnUrl;
        
        if (membersReturn) {
            returnUrl = new URL(membersReturn, window.location.href).href;
        }
        
        function clickHandler(event) {
            handleManageBillingClick(el, errorEl, siteUrl, returnUrl);
        }
        
        el.addEventListener('click', clickHandler);
    });
    
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignoutClick(el, siteUrl);
        }
        
        el.addEventListener('click', clickHandler);
    });
    
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');
    
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;
        
        function clickHandler(event) {
            handleCancelSubscriptionClick(el, errorEl, siteUrl, subscriptionId, hasRetentionOffers, doAction);
        }
        
        el.addEventListener('click', clickHandler);
    });
    
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;
        
        function clickHandler(event) {
            handleContinueSubscriptionClick(el, errorEl, siteUrl, subscriptionId);
        }
        
        el.addEventListener('click', clickHandler);
    });
}
```