```javascript
/* eslint-disable no-console */
import {getCheckoutSessionDataFromPlanAttribute, getUrlHistory} from './utils/helpers';
import {HumanReadableError, chooseBestErrorMessage} from './utils/errors';
import {t} from './utils/i18n';

// ============================================================================
// Utility Functions
// ============================================================================

function setErrorMessage(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

function clearErrorMessage(errorEl) {
    setErrorMessage(errorEl, '');
}

function setLoadingState(el, isLoading) {
    if (isLoading) {
        el.classList.add('loading');
    } else {
        el.classList.remove('loading');
    }
}

function setErrorState(el, hasError) {
    if (hasError) {
        el.classList.add('error');
    } else {
        el.classList.remove('error');
    }
}

function clearFormStates(form) {
    form.classList.remove('success', 'invalid', 'error');
}

function getFormInputValue(form, selector) {
    const input = form.querySelector(selector);
    return input?.value;
}

function getFormInputValues(form, selector) {
    return Array.from(form.querySelectorAll(selector)).map(input => input.value);
}

function getFormLabels(form) {
    return getFormInputValues(form, 'input[data-members-label]');
}

function getFormNewsletters(form) {
    const inputs = form.querySelectorAll(
        'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    );
    return Array.from(inputs).map(input => ({name: input.value}));
}

function hasCheckableNewsletterInputs(form) {
    return form.querySelectorAll('input[type=checkbox][data-members-newsletter]').length > 0;
}

function buildRequestBody(form, emailType, email, name, autoRedirect, wantsOTC) {
    const labels = getFormLabels(form);
    const newsletters = getFormNewsletters(form);
    const urlHistory = getUrlHistory();

    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true'
    };

    if (wantsOTC) {
        body.includeOTC = true;
    }

    if (urlHistory) {
        body.urlHistory = urlHistory;
    }

    if (newsletters.length > 0) {
        body.newsletters = newsletters;
    } else if (hasCheckableNewsletterInputs(form)) {
        body.newsletters = [];
    }

    return body;
}

function normalizeUrl(url, baseUrl = window.location.href) {
    return url ? new URL(url, baseUrl).href : undefined;
}

async function fetchSession(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/session`, {
        credentials: 'same-origin'
    });
    return res.ok ? res.text() : null;
}

async function fetchIntegrityToken(siteUrl) {
    const res = await fetch(`${siteUrl}/members/api/integrity-token/`, {method: 'GET'});
    return res.text();
}

function makeJsonRequest(url, body, method = 'POST') {
    return fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
}

// ============================================================================
// Form Submission Handler
// ============================================================================

export async function formSubmitHandler(
    {event, form, errorEl, siteUrl, submitHandler, doAction, captureException}
) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    clearErrorMessage(errorEl);
    clearFormStates(form);

    const email = getFormInputValue(form, 'input[data-members-email]');
    const nameInput = getFormInputValue(form, 'input[data-members-name]');
    const name = (nameInput || '').trim() || undefined;
    const autoRedirect = form?.dataset?.membersAutoredirect || 'true';
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    form.classList.add('loading');

    try {
        const integrityToken = await fetchIntegrityToken(siteUrl);
        const reqBody = buildRequestBody(form, emailType, email, name, autoRedirect, wantsOTC);
        reqBody.integrityToken = integrityToken;

        const magicLinkRes = await makeJsonRequest(
            `${siteUrl}/members/api/send-magic-link/`,
            reqBody
        );

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            form.classList.add('success');

            if (wantsOTC) {
                try {
                    const responseBody = await magicLinkRes.clone().json();
                    const otcRef = responseBody?.otc_ref;

                    if (otcRef && typeof doAction === 'function') {
                        doAction('startSigninOTCFromCustomForm', {
                            email: (email || '').trim(),
                            otcRef,
                            inboxLinks: responseBody?.inboxLinks
                        });
                    }
                } catch (e) {
                    console.error(e);
                    captureException?.(e);
                }
            }
        } else {
            const error = await HumanReadableError.fromApiResponse(magicLinkRes);
            const errorMessage = chooseBestErrorMessage(error, t('Failed to send magic link email'));
            setErrorMessage(errorEl, errorMessage);
            form.classList.add('error');
        }
    } catch (err) {
        form.classList.add('error');
        const defaultMessage = t('There was an error sending the email, please try again');
        setErrorMessage(errorEl, chooseBestErrorMessage(err, defaultMessage));
    }
}

// ============================================================================
// Plan Click Handler
// ============================================================================

export function planClickHandler({event, el, errorEl, siteUrl, site, member, clickHandler}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const checkoutSuccessUrl = normalizeUrl(el.dataset.membersSuccess);
    const checkoutCancelUrl = normalizeUrl(el.dataset.membersCancel);

    clearErrorMessage(errorEl);
    setLoadingState(el, true);

    const metadata = member ? {checkoutType: 'upgrade'} : {};
    const urlHistory = getUrlHistory();

    if (urlHistory) {
        metadata.urlHistory = urlHistory;
    }

    return fetchSession(siteUrl)
        .then(identity => makeJsonRequest(
            `${siteUrl}/members/api/create-stripe-checkout-session/`,
            {
                ...requestData,
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl,
                metadata
            }
        ).then(res => {
            if (!res.ok) {
                throw new Error(t('Could not create stripe checkout session'));
            }
            return res.json();
        }))
        .then(responseBody => {
            if (responseBody.url) {
                return window.location.assign(responseBody.url);
            }
            const stripe = window.Stripe(responseBody.publicKey);
            return stripe.redirectToCheckout({sessionId: responseBody.sessionId})
                .then(redirectResult => {
                    if (redirectResult.error) {
                        throw new Error(redirectResult.error.message);
                    }
                });
        })
        .catch(err => {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorMessage(errorEl, err.message);
            setErrorState(el, true);
        });
}

// ============================================================================
// Stripe Session Handlers
// ============================================================================

function createStripeSessionHandler(siteUrl, endpoint, bodyBuilder, errorEl, el, clickHandler) {
    return async (event) => {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setErrorState(el, false);
        setLoadingState(el, true);
        clearErrorMessage(errorEl);

        try {
            const identity = await fetchSession(siteUrl);
            const body = bodyBuilder(identity);
            const res = await makeJsonRequest(`${siteUrl}${endpoint}`, body);

            if (!res.ok) {
                throw new Error(t('Could not create Stripe session'));
            }

            return res.json();
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorMessage(errorEl, err.message);
            setErrorState(el, true);
            throw err;
        }
    };
}

// ============================================================================
// Edit Billing Handler
// ============================================================================

function handleEditBilling(siteUrl, el, errorEl, clickHandler) {
    const successUrl = normalizeUrl(el.dataset.membersSuccess);
    const cancelUrl = normalizeUrl(el.dataset.membersCancel);

    const handler = createStripeSessionHandler(
        siteUrl,
        '/members/api/create-stripe-update-session/',
        (identity) => ({identity, successUrl, cancelUrl}),
        errorEl,
        el,
        clickHandler
    );

    return async (event) => {
        try {
            const result = await handler(event);
            const stripe = window.Stripe(result.publicKey);
            const redirectResult = await stripe.redirectToCheckout({sessionId: result.sessionId});

            if (redirectResult.error) {
                throw new Error(t(redirectResult.error.message));
            }
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorMessage(errorEl, err.message);
            setErrorState(el, true);
        }
    };
}

// ============================================================================
// Manage Billing Handler
// ============================================================================

function handleManageBilling(siteUrl, el, errorEl, clickHandler) {
    const returnUrl = normalizeUrl(el.dataset.membersReturn);

    const handler = createStripeSessionHandler(
        siteUrl,
        '/members/api/create-stripe-billing-portal-session/',
        (identity) => ({identity, returnUrl}),
        errorEl,
        el,
        clickHandler
    );

    return async (event) => {
        try {
            const result = await handler(event);
            window.location.assign(result.url);
        } catch (err) {
            console.error(err);
        }
    };
}

// ============================================================================
// Sign Out Handler
// ============================================================================

function handleSignOut(siteUrl, el, clickHandler) {
    return async (event) => {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setErrorState(el, false);
        setLoadingState(el, true);

        try {
            const res = await fetch(`${siteUrl}/members/api/session`, {method: 'DELETE'});

            if (res.ok) {
                window.location.replace(siteUrl);
            } else {
                el.addEventListener('click', clickHandler);
                setLoadingState(el, false);
                setErrorState(el, true);
            }
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorState(el, true);
        }
    };
}

// ============================================================================
// Subscription Handlers
// ============================================================================

function handleCancelSubscription(siteUrl, el, errorEl, clickHandler, hasRetentionOffers, doAction) {
    return async (event) => {
        event.preventDefault();

        const subscriptionId = el.dataset.membersCancelSubscription;

        if (hasRetentionOffers) {
            doAction('openPopup', {
                page: 'accountPlan',
                pageData: {subscriptionId, action: 'cancel'}
            });
            return;
        }

        el.removeEventListener('click', clickHandler);
        setErrorState(el, false);
        setLoadingState(el, true);
        clearErrorMessage(errorEl);

        try {
            const identity = await fetchSession(siteUrl);
            const res = await makeJsonRequest(
                `${siteUrl}/members/api/subscriptions/${subscriptionId}/`,
                {identity, smart_cancel: true},
                'PUT'
            );

            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                setLoadingState(el, false);
                setErrorState(el, true);
                setErrorMessage(errorEl, t('There was an error cancelling your subscription, please try again.'));
            }
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorState(el, true);
            setErrorMessage(errorEl, t('There was an error cancelling your subscription, please try again.'));
        }
    };
}

function handleContinueSubscription(siteUrl, el, errorEl, clickHandler) {
    return async (event) => {
        el.removeEventListener('click', clickHandler);
        event.preventDefault();
        setErrorState(el, false);
        setLoadingState(el, true);
        clearErrorMessage(errorEl);

        const subscriptionId = el.dataset.membersContinueSubscription;

        try {
            const identity = await fetchSession(siteUrl);
            const res = await makeJsonRequest(
                `${siteUrl}/members/api/subscriptions/${subscriptionId}/`,
                {identity, cancel_at_period_end: false},
                'PUT'
            );

            if (res.ok) {
                window.location.reload();
            } else {
                el.addEventListener('click', clickHandler);
                setLoadingState(el, false);
                setErrorState(el, true);
                setErrorMessage(errorEl, t('There was an error continuing your subscription, please try again.'));
            }
        } catch (err) {
            console.error(err);
            el.addEventListener('click', clickHandler);
            setLoadingState(el, false);
            setErrorState(el, true);
            setErrorMessage(errorEl, t('There was an error continuing your subscription, please try again.'));
        }
    };
}

// ============================================================================
// Main Handler
// ============================================================================

export function handleDataAttributes({siteUrl, site = {}, member, offers = [], doAction, captureException} = {}) {
    if (!siteUrl) {
        return;
    }

    siteUrl = siteUrl.replace(/\/$/, '');

    // Forms
    Array.from(document.querySelectorAll('form[data-members-form]')).forEach(form => {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = (event) => {
            formSubmitHandler({event, errorEl, form, siteUrl, submitHandler, doAction, captureException});
        };
        form.addEventListener('submit', submitHandler);
    });

    // Plan buttons
    Array.from(document.querySelectorAll('[data-members-plan]')).forEach(el => {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = (event) => {
            planClickHandler({el, event, errorEl, member, site, siteUrl, clickHandler});
        };
        el.addEventListener('click', clickHandler);