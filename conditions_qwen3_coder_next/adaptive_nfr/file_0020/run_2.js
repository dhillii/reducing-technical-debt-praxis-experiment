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

function isWantsOTC(emailType, form) {
    return emailType === 'signin' && form?.dataset?.membersOtc === 'true';
}

function hasCheckableNewsletterInputs(target) {
    return target.querySelectorAll('input[type=checkbox][data-members-newsletter]').length > 0;
}

function shouldSetEmptyNewsletters(newsletterInputs, checkableNewsletterInputs) {
    return newsletterInputs.length === 0 && checkableNewsletterInputs.length > 0;
}

function extractLabels(target) {
    const labelInputs = target.querySelectorAll('input[data-members-label]') || [];
    const labels = [];
    for (let i = 0; i < labelInputs.length; ++i) {
        labels.push(labelInputs[i].value);
    }
    return labels;
}

function extractNewsletters(target) {
    const newsletterInputs = target.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked') || [];
    const newsletters = [];
    for (let i = 0; i < newsletterInputs.length; ++i) {
        newsletters.push({name: newsletterInputs[i].value});
    }
    return newsletters;
}

function buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, target) {
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
    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs(target)) {
        reqBody.newsletters = [];
    }

    return reqBody;
}

function processMagicLinkResponse(form, magicLinkRes, wantsOTC, email, doAction, captureException) {
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

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const wantsOTC = isWantsOTC(emailType, form);
    const labels = extractLabels(event.target);
    const newsletters = extractNewsletters(event.target);
    const urlHistory = getUrlHistory();

    form.classList.add('loading');

    const reqBody = buildRequestBody(email, emailType, labels, name, autoRedirect, wantsOTC, urlHistory, newsletters, event.target);

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

        await processMagicLinkResponse(form, magicLinkRes, wantsOTC, email, doAction, captureException);
    } catch (err) {
        handleError(err, form, errorEl);
    }
}

function buildCheckoutSessionUrl(successUrl, cancelUrl) {
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

function buildMetadata(member, urlHistory) {
    const metadata = member ? {
        checkoutType: 'upgrade'
    } : {};

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return metadata;
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

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const {checkoutSuccessUrl, checkoutCancelUrl} = buildCheckoutSessionUrl(el.dataset.membersSuccess, el.dataset.membersCancel);

    if (errorEl) {
        errorEl.innerText = '';
    }
    el.classList.add('loading');

    const urlHistory = getUrlHistory();
    const metadata = buildMetadata(member, urlHistory);

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
        return handleCheckoutSessionResponse(responseBody);
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

function extractUrlsFromDataset(el, datasetKey) {
    const url = el.dataset[datasetKey];
    if (!url) {
        return null;
    }
    return (new URL(url, window.location.href)).href;
}

function handleStripeSessionResponse(result) {
    const stripe = window.Stripe(result.publicKey);
    return stripe.redirectToCheckout({
        sessionId: result.sessionId
    });
}

function handleStripeSessionError(err, el, clickHandler, errorEl) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) {
        errorEl.innerText = err.message;
    }
    el.classList.add('error');
}

function handleUpdateBillingSession({siteUrl, el, errorEl, clickHandler}) {
    const membersSuccess = extractUrlsFromDataset(el, 'membersSuccess');
    const membersCancel = extractUrlsFromDataset(el, 'membersCancel');

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
                identity: identity,
                successUrl: membersSuccess,
                cancelUrl: membersCancel
            })
        }).then(function (res) {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        });
    }).then(function (result) {
        return handleStripeSessionResponse(result);
    }).then(function (result) {
        if (result?.error) {
            throw new Error(t(result.error.message));
        }
    }).catch(function (err) {
        handleStripeSessionError(err, el, clickHandler, errorEl);
    });
}

function handleBillingPortalSession({siteUrl, el, errorEl, clickHandler}) {
    const returnUrl = extractUrlsFromDataset(el, 'membersReturn');

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
                identity: identity,
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
        handleStripeSessionError(err, el, clickHandler, errorEl);
    });
}

function handleSignout({siteUrl, el, clickHandler}) {
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

function handleCancelSubscription({siteUrl, el, errorEl, clickHandler, hasRetentionOffers, doAction}) {
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

function handleContinueSubscription({siteUrl, el, errorEl, clickHandler}) {
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
        function clickHandler(event) {
            handleUpdateBillingSession({siteUrl, el, errorEl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-manage-billing]'), function (el) {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleBillingPortalSession({siteUrl, el, errorEl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-signout]'), function (el) {
        function clickHandler(event) {
            handleSignout({siteUrl, el, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-cancel-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleCancelSubscription({siteUrl, el, errorEl, clickHandler, hasRetentionOffers, doAction});
        }
        el.addEventListener('click', clickHandler);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-members-continue-subscription]'), function (el) {
        const errorEl = el.parentElement.querySelector('[data-members-error]');
        function clickHandler(event) {
            handleContinueSubscription({siteUrl, el, errorEl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });
}