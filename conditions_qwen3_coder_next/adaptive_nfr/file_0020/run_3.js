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

function extractLabels(eventTarget) {
    const labelInputs = eventTarget.querySelectorAll('input[data-members-label]');
    return Array.from(labelInputs).map(input => input.value);
}

function extractNewsletters(eventTarget) {
    const newsletterInputs = eventTarget.querySelectorAll('input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked');
    return Array.from(newsletterInputs).map(input => ({name: input.value}));
}

function isCheckableNewsletterOnlyForm(eventTarget) {
    const checkableNewsletterInputs = eventTarget.querySelectorAll('input[type=checkbox][data-members-newsletter]');
    return checkableNewsletterInputs.length > 0;
}

function isWantsOTC(emailType, dataset) {
    return emailType === 'signin' && dataset?.membersOtc === 'true';
}

function shouldSetEmptyNewsletters(reqBody, eventTarget) {
    return !reqBody.newsletters && isCheckableNewsletterOnlyForm(eventTarget);
}

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    displayErrorIfElementExists(errorEl, '');
    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const wantsOTC = isWantsOTC(emailType, form?.dataset);

    const labels = extractLabels(event.target);
    let newsletters = extractNewsletters(event.target);

    const reqBody = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        reqBody.includeOTC = true;
    }

    const urlHistory = getUrlHistory();
    if (urlHistory) {
        reqBody.urlHistory = urlHistory;
    }

    if (newsletters.length > 0) {
        reqBody.newsletters = newsletters;
    } else if (shouldSetEmptyNewsletters(reqBody, event.target)) {
        reqBody.newsletters = [];
    }

    form.classList.add('loading');

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

        if (!magicLinkRes.ok) {
            throw new Error();
        }

        form.classList.add('success');

        if (!wantsOTC) {
            return;
        }

        let responseBody;
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch (e) {
            return;
        }

        const otcRef = responseBody?.otc_ref;
        if (!otcRef || typeof doAction !== 'function') {
            return;
        }

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
    } catch (err) {
        if (err.message) {
            const e = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
            displayErrorIfElementExists(errorEl, errorMessage);
        } else {
            handleError(err, form, errorEl);
        }
        form.classList.add('error');
    }
}

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = el.dataset.membersSuccess ? (new URL(el.dataset.membersSuccess, window.location.href)).href : undefined;
    const checkoutCancelUrl = el.dataset.membersCancel ? (new URL(el.dataset.membersCancel, window.location.href)).href : undefined;

    displayErrorIfElementExists(errorEl, '');
    el.classList.add('loading');

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    }).then(res => res.ok ? res.text() : null)
        .then(identity => fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ...requestData,
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl,
                metadata
            })
        }))
        .then(res => res.ok ? res.json() : Promise.reject(new Error(t('Could not create stripe checkout session'))))
        .then(responseBody => {
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({sessionId: responseBody.sessionId});
        })
        .then(result => {
            if (result?.error) {
                throw new Error(result.error.message);
            }
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            el.classList.remove('loading');
            displayErrorIfElementExists(errorEl, err.message);
            el.classList.add('error');
        });
}

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');
    const hasRetentionOffers = (offers || []).some(offer => offer.redemption_type === 'retention');

    document.querySelectorAll('form[data-members-form]').forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        function submitHandler(event) {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        }
        form.addEventListener('submit', submitHandler);
    });

    document.querySelectorAll('[data-members-plan]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        function clickHandler(event) {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-edit-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess ? (new URL(membersSuccess, window.location.href)).href : undefined;
        const cancelUrl = membersCancel ? (new URL(membersCancel, window.location.href)).href : undefined;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            displayErrorIfElementExists(errorEl, '');
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(res => res.ok ? res.text() : null)
                .then(identity => fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        identity,
                        successUrl,
                        cancelUrl
                    })
                }))
                .then(res => res.ok ? res.json() : Promise.reject(new Error(t('Could not create stripe checkout session'))))
                .then(result => {
                    const stripe = window.Stripe(result.publicKey);
                    return stripe.redirectToCheckout({sessionId: result.sessionId});
                })
                .then(result => {
                    if (result?.error) {
                        throw new Error(t(result.error.message));
                    }
                })
                .catch(err => {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    displayErrorIfElementExists(errorEl, err.message);
                    el.classList.add('error');
                });
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-manage-billing]').forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn ? (new URL(membersReturn, window.location.href)).href : undefined;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            displayErrorIfElementExists(errorEl, '');
            el.classList.add('loading');

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(res => res.ok ? res.text() : null)
                .then(identity => fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        identity,
                        returnUrl
                    })
                }))
                .then(res => res.ok ? res.json() : Promise.reject(new Error(t('Could not create Stripe billing portal session'))))
                .then(result => window.location.assign(result.url))
                .catch(err => {
                    console.error(err);
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    displayErrorIfElementExists(errorEl, err.message);
                    el.classList.add('error');
                });
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-signout]').forEach(el => {
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

    document.querySelectorAll('[data-members-cancel-subscription]').forEach(el => {
        const parent = el.parentElement;
        const errorEl = parent?.querySelector('[data-members-error]');
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
            displayErrorIfElementExists(errorEl, '');

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(res => res.ok ? res.text() : null)
                .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        identity,
                        smart_cancel: true
                    })
                }))
                .then(res => res.ok ? window.location.reload() : Promise.reject())
                .catch(() => {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                    displayErrorIfElementExists(errorEl, t('There was an error cancelling your subscription, please try again.'));
                });
        }
        el.addEventListener('click', clickHandler);
    });

    document.querySelectorAll('[data-members-continue-subscription]').forEach(el => {
        const parent = el.parentElement;
        const errorEl = parent?.querySelector('[data-members-error]');
        const subscriptionId = el.dataset.membersContinueSubscription;

        function clickHandler(event) {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');
            displayErrorIfElementExists(errorEl, '');

            fetch(`${siteUrl}/members/api/session`, {
                credentials: 'same-origin'
            }).then(res => res.ok ? res.text() : null)
                .then(identity => fetch(`${siteUrl}/members/api/subscriptions/${subscriptionId}/`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        identity,
                        cancel_at_period_end: false
                    })
                }))
                .then(res => res.ok ? window.location.reload() : Promise.reject())
                .catch(() => {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                    displayErrorIfElementExists(errorEl, t('There was an error continuing your subscription, please try again.'));
                });
        }
        el.addEventListener('click', clickHandler);
    });
}