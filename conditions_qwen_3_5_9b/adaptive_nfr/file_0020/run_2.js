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
    
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    
    return {email, name};
}

function extractNewsletterInputs(event) {
    const newsletterInputs = event.target.querySelectorAll(
        'input[type=hidden][data-members-newsletter], ' +
        'input[type=checkbox][data-members-newsletter]:checked, ' +
        'input[type=radio][data-members-newsletter]:checked'
    ) || [];
    
    return newsletterInputs.map(input => ({name: input.value}));
}

function extractLabelInputs(event) {
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    return labelInputs.map(input => input.value);
}

function buildRequestBody({email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters}) {
    const reqBody = {
        email,
        emailType,
        labels,
        name,
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
    } else if (newsletters.length === 0) {
        const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
        
        if (checkableNewsletterInputs.length > 0) {
            reqBody.newsletters = [];
        }
    }
    
    return reqBody;
}

function handleFormSuccess({form, magicLinkRes, wantsOTC, doAction, captureException, email, responseBody}) {
    form.classList.add('success');
    
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
}

function handleFormError(magicLinkRes, errorEl) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    displayErrorIfElementExists(errorEl, errorMessage);
    form.classList.add('error');
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
    
    const {email, name} = extractFormInputs(event);
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';
    
    const labels = extractLabelInputs(event);
    const newsletters = extractNewsletterInputs(event);
    
    const urlHistory = getUrlHistory();
    
    form.classList.add('loading');
    
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
            await handleFormSuccess({
                form,
                magicLinkRes,
                wantsOTC,
                doAction,
                captureException,
                email,
                responseBody: undefined
            });
        } else {
            await handleFormError(magicLinkRes, errorEl);
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

function buildCheckoutUrls({successUrl, cancelUrl}) {
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;
    
    return {checkoutSuccessUrl, checkoutCancelUrl};
}

function buildCheckoutMetadata({member, urlHistory}) {
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

function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();
    
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const {successUrl, cancelUrl} = el.dataset;
    const {checkoutSuccessUrl, checkoutCancelUrl} = buildCheckoutUrls({successUrl, cancelUrl});
    
    if (errorEl) {
        errorEl.innerText = '';
    }
    
    el.classList.add('loading');
    const urlHistory = getUrlHistory();
    const metadata = buildCheckoutMetadata({member, urlHistory});
    
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
                identity,
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
    }).catch(function (err) {
        handlePlanClickError(err, el, errorEl);
    });
}

function buildEditBillingUrls({membersSuccess, membersCancel}) {
    const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
    const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;
    
    return {successUrl, cancelUrl};
}

function handleEditBillingError(err, el, errorEl) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    
    el.classList.add('error');
}

function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
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
        const {membersSuccess, membersCancel} = el.dataset;
        const {successUrl, cancelUrl} = buildEditBillingUrls({membersSuccess, membersCancel});
        
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            
            if (errorEl) {
                errorEl.innerText = '';
            }
            
            el.classList.add('loading');
            
            return fetch(`${siteUrl}/members/api/session`, {
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
            }).then(function (result) {
                const stripe = window.Stripe(result.publicKey);
                return stripe.redirectToCheckout({
                    sessionId: result.sessionId
                });
            }).then(function (result) {
                if (result.error) {
                    throw new Error(t(result.error.message));
                }
            }).catch(function (err) {
                handleEditBillingError(err, el, errorEl);
            });
        }
        
        el.addEventListener('click', clickHandler);
    });
    
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;
        
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            
            if (errorEl) {
                errorEl.innerText = '';
            }
            
            el.classList.add('loading');
            
            return fetch(`${siteUrl}/members/api/session`, {
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
                        identity,
                        returnUrl
                    })
                }).then(function (res) {
                    if (!res.ok) {
                        throw new Error(t('Could not create Stripe billing portal session'));
                    }
                    return res.json();
                });
            }).then(function (result) {
                return window.location.assign(result.url);
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
        
        el.addEventListener('click', clickHandler);
    });
    
    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            
            return fetch(`${siteUrl}/members/api/session`, {
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
                        identity,
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
                        identity,
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
```