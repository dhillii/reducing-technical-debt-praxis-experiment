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
    const labelInputs = event.target.querySelectorAll('input[data-members-label]') || [];
    return Array.from(labelInputs).map(input => input.value);
}

function extractNewsletters(event) {
    const newsletterInputs = event.target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    return Array.from(newsletterInputs).map(input => ({name: input.value}));
}

function shouldSetEmptyNewsletters(event) {
    const checkableNewsletterInputs = event.target.querySelectorAll('input[type=checkbox][data-members-newsletter]') || [];
    return checkableNewsletterInputs.length > 0;
}

function buildRequestData(form, email, name, emailType, labels, newsletters, wantsOTC, urlHistory) {
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
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
    } else if (shouldSetEmptyNewsletters(form)) {
        reqBody.newsletters = [];
    }

    return reqBody;
}

async function fetchIntegrityToken(siteUrl) {
    const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return integrityTokenRes.text();
}

async function sendMagicLink(siteUrl, reqBody, integrityToken) {
    const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...reqBody, integrityToken})
    });
    return magicLinkRes;
}

function handleMagicLinkSuccess(form, responseBody, wantsOTC, email, doAction, captureException) {
    form.classList.add('success');

    if (!wantsOTC) {
        return;
    }

    try {
        const otcRef = responseBody?.otc_ref;
        if (otcRef && typeof doAction === 'function') {
            doAction('startSigninOTCFromCustomForm', {
                email: (email || '').trim(),
                otcRef,
                inboxLinks: responseBody?.inboxLinks
            });
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        captureException?.(e);
    }
}

function handleMagicLinkError(magicLinkRes, errorEl) {
    return HumanReadableError.fromApiResponse(magicLinkRes)
        .then(e => {
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
            return false;
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

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form?.dataset?.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');

    const labels = extractLabels(event);
    const newsletters = extractNewsletters(event);
    const urlHistory = getUrlHistory();
    const reqBody = buildRequestData(form, email, name, emailType, labels, newsletters, wantsOTC, urlHistory);

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const magicLinkRes = await sendMagicLink(siteUrl, reqBody, integrityToken);

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            let responseBody;
            if (wantsOTC) {
                try {
                    responseBody = await magicLinkRes.clone().json();
                } catch (e) {
                    responseBody = undefined;
                }
            }
            handleMagicLinkSuccess(form, responseBody, wantsOTC, email, doAction, captureException);
        } else {
            await handleMagicLinkError(magicLinkRes, errorEl);
            form.classList.add('error');
        }
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

function getCheckoutUrls(el) {
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;

    return {
        checkoutSuccessUrl: successUrl ? (new URL(successUrl, window.location.href)).href : undefined,
        checkoutCancelUrl: cancelUrl ? (new URL(cancelUrl, window.location.href)).href : undefined
    };
}

function createStripeCheckoutSession(siteUrl, requestData, identity, checkoutSuccessUrl, checkoutCancelUrl, metadata) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(identity => {
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
        }).then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    });
}

function handleCheckoutResponse(responseBody) {
    if (responseBody.url) {
        return window.location.assign(responseBody.url);
    }

    const stripe = window.Stripe(responseBody.publicKey);
    return stripe.redirectToCheckout({
        sessionId: responseBody.sessionId
    }).then(result => {
        if (result.error) {
            throw new Error(result.error.message);
        }
    });
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

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    createStripeCheckoutSession(siteUrl, requestData, null, checkoutSuccessUrl, checkoutCancelUrl, metadata)
        .then(handleCheckoutResponse)
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

function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(identity => {
        return fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                successUrl,
                cancelUrl
            })
        }).then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    });
}

function handleStripeUpdateResponse(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    }).then(result => {
        if (result.error) {
            throw new Error(t(result.error.message));
        }
    });
}

function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(identity => {
        return fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                returnUrl
            })
        }).then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create Stripe billing portal session'));
            }
            return res.json();
        });
    });
}

function handleBillingPortalResponse(result) {
    return window.location.assign(result.url);
}

function handleSubscriptionAction(siteUrl, subscriptionId, updateBody, successCallback, failureCallback) {
    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => {
        if (!res.ok) {
            return null;
        }
        return res.text();
    }).then(identity => {
        return fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                identity,
                ...updateBody
            })
        }).then(res => {
            if (res.ok) {
                successCallback();
            } else {
                failureCallback();
            }
        });
    });
}

function handleSignout(siteUrl, el) {
    return fetch(`${siteUrl}/members/api/session`, {
        method: 'DELETE'
    }).then(res => {
        if (res.ok) {
            window.location.replace(siteUrl);
        } else {
            el.classList.remove('loading');
            el.classList.add('error');
        }
    });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

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
        const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            if (errorEl) {
                errorEl.innerText = '';
            }
            el.classList.add('loading');

            createStripeUpdateSession(siteUrl, null, successUrl, cancelUrl)
                .then(handleStripeUpdateResponse)
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

            createStripeBillingPortalSession(siteUrl, null, returnUrl)
                .then(handleBillingPortalResponse)
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
            handleSignout(siteUrl, el);
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersCancelSubscription;

        function clickHandler(event) {
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

            handleSubscriptionAction(
                siteUrl,
                subscriptionId,
                {smart_cancel: true},
                () => window.location.reload(),
                () => {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                    if (errorEl) {
                        errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
                    }
                }
            );
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            if (errorEl) {
                errorEl.innerText = '';
            }

            handleSubscriptionAction(
                siteUrl,
                subscriptionId,
                {cancel_at_period_end: false},
                () => window.location.reload(),
                () => {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                    if (errorEl) {
                        errorEl.innerText = t('There was an error continuing your subscription, please try again.');
                    }
                }
            );
        }
        el.addEventListener('click', clickHandler);
    });
}