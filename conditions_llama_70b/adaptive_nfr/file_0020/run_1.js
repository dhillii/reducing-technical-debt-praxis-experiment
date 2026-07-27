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

function isFormValid(form) {
    return form && form.dataset.membersForm;
}

function getFormRequestData(form, siteUrl) {
    const emailInput = form.querySelector('input[data-members-email]');
    const nameInput = form.querySelector('input[data-members-name]');
    const autoRedirect = form.dataset.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const labels = Array.from(form.querySelectorAll('input[data-members-label]')).map(input => input.value);
    const newsletters = Array.from(form.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked')).map(input => ({name: input.value}));
    const urlHistory = getUrlHistory();
    const wantsOTC = emailType === 'signin' && form.dataset.membersOtc === 'true';

    return {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        wantsOTC,
        urlHistory,
        newsletters: newsletters.length > 0 ? newsletters : []
    };
}

function getPlanRequestData(el, site) {
    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    return requestData;
}

function getSuccessAndCancelUrls(el) {
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;
    const checkoutSuccessUrl = successUrl ? (new URL(successUrl, window.location.href)).href : undefined;
    const checkoutCancelUrl = cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined;
    return {checkoutSuccessUrl, checkoutCancelUrl};
}

function createStripeCheckoutSession(siteUrl, requestData, identity, metadata) {
    const {checkoutSuccessUrl, checkoutCancelUrl} = getSuccessAndCancelUrls(requestData.el);
    return fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
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
}

function handleFetchError(res, errorEl) {
    if (!res.ok) {
        throw new Error(t('Could not create stripe checkout session'));
    }
    return res.json();
}

function redirectToCheckout(responseBody) {
    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    });
}

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    if (!isFormValid(form)) {
        return;
    }

    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    if (errorEl) {
        errorEl.innerText = '';
    }
    form.classList.remove('success', 'invalid', 'error');
    const reqBody = getFormRequestData(form, siteUrl);
    form.classList.add('loading');

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({...reqBody, integrityToken})
        });

        if (!magicLinkRes.ok) {
            throw new Error(t('Failed to send magic link email'));
        }

        form.classList.add('success');
        const responseBody = await magicLinkRes.json();
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
    } catch (err) {
        handleError(err, form, errorEl);
    } finally {
        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');
    }
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    event.preventDefault();
    el.removeEventListener('click', clickHandler);
    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const requestData = getPlanRequestData(el, site);
    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    })
    .then(res => res.text())
    .then(identity => createStripeCheckoutSession(siteUrl, {el, ...requestData}, identity, metadata))
    .then(handleFetchError)
    .then(redirectToCheckout)
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
            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
            .then(res => res.text())
            .then(identity => fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: identity,
                    successUrl: successUrl,
                    cancelUrl: cancelUrl
                })
            }))
            .then(handleFetchError)
            .then(responseBody => redirectToCheckout(responseBody))
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
            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
            .then(res => res.text())
            .then(identity => fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: identity,
                    returnUrl
                })
            }))
            .then(handleFetchError)
            .then(responseBody => window.location.assign(responseBody.url))
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
            })
            .then(res => {
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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
            .then(res => res.text())
            .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: identity,
                    smart_cancel: true
                })
            }))
            .then(res => {
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

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            })
            .then(res => res.text())
            .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    identity: identity,
                    cancel_at_period_end: false
                })
            }))
            .then(res => {
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