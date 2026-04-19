```javascript
/* eslint-disable no-console */
import { getCheckoutSessionDataFromPlanAttribute, getUrlHistory } from './utils/helpers';
import { HumanReadableError, chooseBestErrorMessage } from './utils/errors';
import { t } from './utils/i18n';

/**
 * Sets the error message on an element if it exists.
 * @param {HTMLElement | null} errorEl
 * @param {string} message
 */
function setErrorMessage(errorEl, message) {
    if (errorEl) {
        errorEl.innerText = message;
    }
}

/**
 * Handles generic form errors.
 * @param {Error} error
 * @param {HTMLFormElement} form
 * @param {HTMLElement | null} errorEl
 */
function handleFormError(error, form, errorEl) {
    form.classList.add('error');
    const defaultMessage = t('There was an error sending the email, please try again');
    setErrorMessage(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

/**
 * Builds the request body for the magic link request.
 * @param {Object} params
 * @returns {Object}
 */
function buildMagicLinkBody(params) {
    const {
        email,
        emailType,
        labels,
        name,
        autoRedirect,
        wantsOTC,
        urlHistory,
        newsletters,
    } = params;

    const body = {
        email,
        emailType,
        labels,
        name,
        autoRedirect,
    };

    if (wantsOTC) body.includeOTC = true;
    if (urlHistory) body.urlHistory = urlHistory;
    if (newsletters) body.newsletters = newsletters;

    return body;
}

/**
 * Handles the success response of the magic link request.
 * @param {Response} magicLinkRes
 * @param {boolean} wantsOTC
 * @param {string} email
 * @param {Function} doAction
 * @param {Function} captureException
 * @param {HTMLElement | null} errorEl
 * @param {HTMLFormElement} form
 */
async function handleMagicLinkSuccess(
    magicLinkRes,
    wantsOTC,
    email,
    doAction,
    captureException,
    errorEl,
    form
) {
    form.classList.add('success');

    let responseBody;
    if (wantsOTC) {
        try {
            responseBody = await magicLinkRes.clone().json();
        } catch {
            responseBody = undefined;
        }
    }

    const otcRef = responseBody?.otc_ref;
    if (otcRef && typeof doAction === 'function') {
        try {
            doAction('startSigninOTCFromCustomForm', {
                email: (email || '').trim(),
                otcRef,
                inboxLinks: responseBody?.inboxLinks,
            });
        } catch (e) {
            console.error(e);
            captureException?.(e);
        }
    }
}

/**
 * Handles the error response of the magic link request.
 * @param {Response} magicLinkRes
 * @param {HTMLElement | null} errorEl
 * @param {HTMLFormElement} form
 */
async function handleMagicLinkError(magicLinkRes, errorEl, form) {
    const e = await HumanReadableError.fromApiResponse(magicLinkRes);
    const errorMessage = chooseBestErrorMessage(e, t('Failed to send magic link email'));
    setErrorMessage(errorEl, errorMessage);
    form.classList.add('error');
}

/**
 * Submits the form data to the Ghost API.
 * @param {Object} params
 */
export async function formSubmitHandler({
    event,
    form,
    errorEl,
    siteUrl,
    submitHandler,
    doAction,
    captureException,
}) {
    form.removeEventListener('submit', submitHandler);
    event.preventDefault();
    setErrorMessage(errorEl, '');

    form.classList.remove('success', 'invalid', 'error');

    const emailInput = event.target.querySelector('input[data-members-email]');
    const nameInput = event.target.querySelector('input[data-members-name]');
    const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
    const email = emailInput?.value;
    const name = (nameInput?.value || '').trim() || undefined;
    const emailType = form.dataset.membersForm;
    const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

    const labels = Array.from(
        event.target.querySelectorAll('input[data-members-label]') ?? []
    ).map((el) => el.value);

    const newsletterInputs = Array.from(
        event.target.querySelectorAll(
            'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
        ) ?? []
    );

    const newsletters = newsletterInputs.map((el) => ({ name: el.value }));

    const urlHistory = getUrlHistory();

    const reqBody = buildMagicLinkBody({
        email,
        emailType,
        labels,
        name,
        autoRedirect: autoRedirect === 'true',
        wantsOTC,
        urlHistory,
        newsletters,
    });

    form.classList.add('loading');

    try {
        const integrityTokenRes = await fetch(`${siteUrl}/members/api/integrity-token/`, {
            method: 'GET',
        });
        const integrityToken = await integrityTokenRes.text();

        const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...reqBody, integrityToken }),
        });

        form.addEventListener('submit', submitHandler);
        form.classList.remove('loading');

        if (magicLinkRes.ok) {
            await handleMagicLinkSuccess(
                magicLinkRes,
                wantsOTC,
                email,
                doAction,
                captureException,
                errorEl,
                form
            );
        } else {
            await handleMagicLinkError(magicLinkRes, errorEl, form);
        }
    } catch (err) {
        handleFormError(err, form, errorEl);
    }
}

/**
 * Handles plan click events.
 * @param {Object} params
 */
export async function planClickHandler({
    event,
    el,
    errorEl,
    siteUrl,
    site,
    member,
    clickHandler,
}) {
    el.removeEventListener('click', clickHandler);
    event.preventDefault();

    const plan = el.dataset.membersPlan;
    const requestData = getCheckoutSessionDataFromPlanAttribute(site, plan.toLowerCase());
    const successUrl = el.dataset.membersSuccess;
    const cancelUrl = el.dataset.membersCancel;

    const checkoutSuccessUrl = successUrl
        ? new URL(successUrl, window.location.href).href
        : undefined;
    const checkoutCancelUrl = cancelUrl
        ? new URL(cancelUrl, window.location.href).href
        : undefined;

    setErrorMessage(errorEl, '');

    el.classList.add('loading');

    const metadata = member ? { checkoutType: 'upgrade' } : {};
    const urlHistory = getUrlHistory();
    if (urlHistory) metadata.urlHistory = urlHistory;

    try {
        const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
            credentials: 'same-origin',
        });
        const identity = sessionRes.ok ? await sessionRes.text() : null;

        const checkoutRes = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...requestData,
                identity,
                successUrl: checkoutSuccessUrl,
                cancelUrl: checkoutCancelUrl,
                metadata,
            }),
        });

        if (!checkoutRes.ok) {
            throw new Error(t('Could not create stripe checkout session'));
        }

        const responseBody = await checkoutRes.json();

        if (responseBody.url) {
            window.location.assign(responseBody.url);
        } else {
            const stripe = window.Stripe(responseBody.publicKey);
            const redirectResult = await stripe.redirectToCheckout({
                sessionId: responseBody.sessionId,
            });

            if (redirectResult.error) {
                throw new Error(redirectResult.error.message);
            }
        }
    } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        setErrorMessage(errorEl, err.message);
        el.classList.add('error');
    }
}

/**
 * Handles all data attribute interactions on the page.
 * @param {Object} params
 */
export function handleDataAttributes({
    siteUrl,
    site = {},
    member,
    offers = [],
    doAction,
    captureException,
} = {}) {
    if (!siteUrl) return;

    siteUrl = siteUrl.replace(/\/$/, '');

    // Helper to attach a submit handler to a form
    function attachFormHandler(form) {
        const errorEl = form.querySelector('[data-members-error]');
        const submitHandler = (event) =>
            formSubmitHandler({ event, errorEl, form, siteUrl, submitHandler, doAction, captureException });
        form.addEventListener('submit', submitHandler);
    }

    // Helper to attach a click handler to a plan element
    function attachPlanHandler(el) {
        const errorEl = el.querySelector('[data-members-error]');
        const clickHandler = (event) =>
            planClickHandler({ el, event, errorEl, member, site, siteUrl, clickHandler });
        el.addEventListener('click', clickHandler);
    }

    // Attach handlers for forms
    document.querySelectorAll('form[data-members-form]').forEach(attachFormHandler);

    // Attach handlers for plan elements
    document.querySelectorAll('[data-members-plan]').forEach(attachPlanHandler);

    // Edit billing handler
    document.querySelectorAll('[data-members-edit-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersSuccess = el.dataset.membersSuccess;
        const membersCancel = el.dataset.membersCancel;
        const successUrl = membersSuccess
            ? new URL(membersSuccess, window.location.href).href
            : undefined;
        const cancelUrl = membersCancel
            ? new URL(membersCancel, window.location.href).href
            : undefined;

        const clickHandler = async (event) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            setErrorMessage(errorEl, '');
            el.classList.add('loading');

            try {
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
                    credentials: 'same-origin',
                });
                const identity = sessionRes.ok ? await sessionRes.text() : null;

                const updateRes = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        identity,
                        successUrl,
                        cancelUrl,
                    }),
                });

                if (!updateRes.ok) {
                    throw new Error(t('Could not create stripe checkout session'));
                }

                const result = await updateRes.json();
                const stripe = window.Stripe(result.publicKey);
                const redirectResult = await stripe.redirectToCheckout({
                    sessionId: result.sessionId,
                });

                if (redirectResult.error) {
                    throw new Error(t(redirectResult.error.message));
                }
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                setErrorMessage(errorEl, err.message);
                el.classList.add('error');
            }
        };

        el.addEventListener('click', clickHandler);
    });

    // Manage billing handler
    document.querySelectorAll('[data-members-manage-billing]').forEach((el) => {
        const errorEl = el.querySelector('[data-members-error]');
        const membersReturn = el.dataset.membersReturn;
        const returnUrl = membersReturn
            ? new URL(membersReturn, window.location.href).href
            : undefined;

        const clickHandler = async (event) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();

            setErrorMessage(errorEl, '');
            el.classList.add('loading');

            try {
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
                    credentials: 'same-origin',
                });
                const identity = sessionRes.ok ? await sessionRes.text() : null;

                const portalRes = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        identity,
                        returnUrl,
                    }),
                });

                if (!portalRes.ok) {
                    throw new Error(t('Could not create Stripe billing portal session'));
                }

                const result = await portalRes.json();
                window.location.assign(result.url);
            } catch (err) {
                console.error(err);
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                setErrorMessage(errorEl, err.message);
                el.classList.add('error');
            }
        };

        el.addEventListener('click', clickHandler);
    });

    // Signout handler
    document.querySelectorAll('[data-members-signout]').forEach((el) => {
        const clickHandler = async (event) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            try {
                const res = await fetch(`${siteUrl}/members/api/session`, {
                    method: 'DELETE',
                });

                if (res.ok) {
                    window.location.replace(siteUrl);
                } else {
                    el.addEventListener('click', clickHandler);
                    el.classList.remove('loading');
                    el.classList.add('error');
                }
            } catch {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
            }
        };

        el.addEventListener('click', clickHandler);
    });

    const hasRetentionOffers = offers.some((offer) => offer.redemption_type === 'retention');

    // Cancel subscription handler
    document.querySelectorAll('[data-members-cancel-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        const clickHandler = async (event) => {
            event.preventDefault();

            const subscriptionId = el.dataset.membersCancelSubscription;

            if (hasRetentionOffers) {
                doAction('openPopup', {
                    page: 'accountPlan',
                    pageData: { subscriptionId, action: 'cancel' },
                });
                return;
            }

            el.removeEventListener('click', clickHandler);
            el.classList.remove('error');
            el.classList.add('loading');

            setErrorMessage(errorEl, '');

            try {
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
                    credentials: 'same-origin',
                });
                const identity = sessionRes.ok ? await sessionRes.text() : null;

                const cancelRes = await fetch(
                    `${siteUrl}/members/api/subscriptions/${subscriptionId}/`,
                    {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            identity,
                            smart_cancel: true,
                        }),
                    }
                );

                if (cancelRes.ok) {
                    window.location.reload();
                } else {
                    throw new Error();
                }
            } catch {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                setErrorMessage(errorEl, t('There was an error cancelling your subscription, please try again.'));
            }
        };

        el.addEventListener('click', clickHandler);
    });

    // Continue subscription handler
    document.querySelectorAll('[data-members-continue-subscription]').forEach((el) => {
        const errorEl = el.parentElement.querySelector('[data-members-error]');

        const clickHandler = async (event) => {
            el.removeEventListener('click', clickHandler);
            event.preventDefault();
            el.classList.remove('error');
            el.classList.add('loading');

            const subscriptionId = el.dataset.membersContinueSubscription;

            setErrorMessage(errorEl, '');

            try {
                const sessionRes = await fetch(`${siteUrl}/members/api/session`, {
                    credentials: 'same-origin',
                });
                const identity = sessionRes.ok ? await sessionRes.text() : null;

                const continueRes = await fetch(
                    `${siteUrl}/members/api/subscriptions/${subscriptionId}/`,
                    {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            identity,
                            cancel_at_period_end: false,
                        }),
                    }
                );

                if (continueRes.ok) {
                    window.location.reload();
                } else {
                    throw new Error();
                }
            } catch {
                el.addEventListener('click', clickHandler);
                el.classList.remove('loading');
                el.classList.add('error');
                setErrorMessage(errorEl, t('There was an error continuing your subscription, please try again.'));
            }
        };

        el.addEventListener('click', clickHandler);
    });
}
```