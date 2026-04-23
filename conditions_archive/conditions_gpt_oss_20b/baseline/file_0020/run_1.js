```javascript
/* eslint-disable no-console */
import {
  getCheckoutSessionDataFromPlanAttribute,
  getUrlHistory,
} from './utils/helpers';
import { HumanReadableError, chooseBestErrorMessage } from './utils/errors';
import { t } from './utils/i18n';

function displayErrorIfElementExists(errorEl, message) {
  if (errorEl) errorEl.innerText = message;
}

function handleError(error, form, errorEl) {
  form.classList.add('error');
  const defaultMessage = t(
    'There was an error sending the email, please try again'
  );
  displayErrorIfElementExists(errorEl, chooseBestErrorMessage(error, defaultMessage));
}

async function fetchIdentity(siteUrl) {
  const res = await fetch(`${siteUrl}/members/api/session`, {
    credentials: 'same-origin',
  });
  if (!res.ok) return null;
  return res.text();
}

async function createStripeCheckoutSession(
  siteUrl,
  requestData,
  identity,
  successUrl,
  cancelUrl,
  metadata
) {
  const body = {
    ...requestData,
    identity,
    successUrl,
    cancelUrl,
    metadata,
  };
  const res = await fetch(`${siteUrl}/members/api/create-stripe-checkout-session/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
  return res.json();
}

async function createStripeUpdateSession(siteUrl, identity, successUrl, cancelUrl) {
  const body = { identity, successUrl, cancelUrl };
  const res = await fetch(`${siteUrl}/members/api/create-stripe-update-session/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(t('Could not create stripe checkout session'));
  return res.json();
}

async function createStripeBillingPortalSession(siteUrl, identity, returnUrl) {
  const body = { identity, returnUrl };
  const res = await fetch(`${siteUrl}/members/api/create-stripe-billing-portal-session/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(t('Could not create Stripe billing portal session'));
  return res.json();
}

async function cancelSubscription(siteUrl, identity, subscriptionId) {
  const body = { identity, smart_cancel: true };
  const res = await fetch(
    `${siteUrl}/members/api/subscriptions/${subscriptionId}/`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return res;
}

async function continueSubscription(siteUrl, identity, subscriptionId) {
  const body = { identity, cancel_at_period_end: false };
  const res = await fetch(
    `${siteUrl}/members/api/subscriptions/${subscriptionId}/`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return res;
}

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
  if (errorEl) errorEl.innerText = '';
  form.classList.remove('success', 'invalid', 'error');

  const emailInput = event.target.querySelector('input[data-members-email]');
  const nameInput = event.target.querySelector('input[data-members-name]');
  const autoRedirect = form?.dataset?.membersAutoredirect ?? 'true';
  const email = emailInput?.value;
  const name = (nameInput?.value || '').trim() || undefined;
  const emailType = form.dataset.membersForm;
  const wantsOTC = emailType === 'signin' && form?.dataset?.membersOtc === 'true';

  const labels = Array.from(
    event.target.querySelectorAll('input[data-members-label]')
  ).map((el) => el.value);

  const newsletterInputs = Array.from(
    event.target.querySelectorAll(
      'input[type=hidden][data-members-newsletter], input[type=checkbox][data-members-newsletter]:checked, input[type=radio][data-members-newsletter]:checked'
    )
  );
  const newsletters = newsletterInputs.map((el) => ({ name: el.value }));

  const reqBody = {
    email,
    emailType,
    labels,
    name,
    autoRedirect: autoRedirect === 'true',
  };
  if (wantsOTC) reqBody.includeOTC = true;
  const urlHistory = getUrlHistory();
  if (urlHistory) reqBody.urlHistory = urlHistory;
  if (newsletterInputs.length > 0) reqBody.newsletters = newsletters;
  else {
    const checkableNewsletterInputs = event.target.querySelectorAll(
      'input[type=checkbox][data-members-newsletter]'
    );
    if (checkableNewsletterInputs.length > 0) reqBody.newsletters = [];
  }

  try {
    const integrityTokenRes = await fetch(
      `${siteUrl}/members/api/integrity-token/`,
      { method: 'GET' }
    );
    const integrityToken = await integrityTokenRes.text();

    const magicLinkRes = await fetch(`${siteUrl}/members/api/send-magic-link/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...reqBody, integrityToken }),
    });

    form.addEventListener('submit', submitHandler);
    form.classList.remove('loading');

    if (magicLinkRes.ok) {
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
  const successUrl = el.dataset.membersSuccess
    ? new URL(el.dataset.membersSuccess, window.location.href).href
    : undefined;
  const cancelUrl = el.dataset.membersCancel
    ? new URL(el.dataset.membersCancel, window.location.href).href
    : undefined;

  if (errorEl) errorEl.innerText = '';
  el.classList.add('loading');

  const metadata = member ? { checkoutType: 'upgrade' } : {};
  const urlHistory = getUrlHistory();
  if (urlHistory) metadata.urlHistory = urlHistory;

  try {
    const identity = await fetchIdentity(siteUrl);
    const responseBody = await createStripeCheckoutSession(
      siteUrl,
      requestData,
      identity,
      successUrl,
      cancelUrl,
      metadata
    );

    if (responseBody.url) {
      window.location.assign(responseBody.url);
    } else {
      const stripe = window.Stripe(responseBody.publicKey);
      const redirectResult = await stripe.redirectToCheckout({
        sessionId: responseBody.sessionId,
      });
      if (redirectResult.error) throw new Error(redirectResult.error.message);
    }
  } catch (err) {
    console.error(err);
    el.addEventListener('click', clickHandler);
    el.classList.remove('loading');
    if (errorEl) errorEl.innerText = err.message;
    el.classList.add('error');
  }
}

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

  const addFormHandler = (form) => {
    const errorEl = form.querySelector('[data-members-error]');
    const submitHandler = (event) =>
      formSubmitHandler({
        event,
        errorEl,
        form,
        siteUrl,
        submitHandler,
        doAction,
        captureException,
      });
    form.addEventListener('submit', submitHandler);
  };

  const addPlanHandler = (el) => {
    const errorEl = el.querySelector('[data-members-error]');
    const clickHandler = (event) =>
      planClickHandler({
        el,
        event,
        errorEl,
        member,
        site,
        siteUrl,
        clickHandler,
      });
    el.addEventListener('click', clickHandler);
  };

  const addBillingEditHandler = (el) => {
    const errorEl = el.querySelector('[data-members-error]');
    const successUrl = el.dataset.membersSuccess
      ? new URL(el.dataset.membersSuccess, window.location.href).href
      : undefined;
    const cancelUrl = el.dataset.membersCancel
      ? new URL(el.dataset.membersCancel, window.location.href).href
      : undefined;

    const clickHandler = async (event) => {
      el.removeEventListener('click', clickHandler);
      event.preventDefault();
      if (errorEl) errorEl.innerText = '';
      el.classList.add('loading');

      try {
        const identity = await fetchIdentity(siteUrl);
        const result = await createStripeUpdateSession(
          siteUrl,
          identity,
          successUrl,
          cancelUrl
        );
        const stripe = window.Stripe(result.publicKey);
        const redirectResult = await stripe.redirectToCheckout({
          sessionId: result.sessionId,
        });
        if (redirectResult.error) throw new Error(t(redirectResult.error.message));
      } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
      }
    };
    el.addEventListener('click', clickHandler);
  };

  const addBillingPortalHandler = (el) => {
    const errorEl = el.querySelector('[data-members-error]');
    const returnUrl = el.dataset.membersReturn
      ? new URL(el.dataset.membersReturn, window.location.href).href
      : undefined;

    const clickHandler = async (event) => {
      el.removeEventListener('click', clickHandler);
      event.preventDefault();
      if (errorEl) errorEl.innerText = '';
      el.classList.add('loading');

      try {
        const identity = await fetchIdentity(siteUrl);
        const result = await createStripeBillingPortalSession(
          siteUrl,
          identity,
          returnUrl
        );
        window.location.assign(result.url);
      } catch (err) {
        console.error(err);
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        if (errorEl) errorEl.innerText = err.message;
        el.classList.add('error');
      }
    };
    el.addEventListener('click', clickHandler);
  };

  const addSignoutHandler = (el) => {
    const clickHandler = async (event) => {
      el.removeEventListener('click', clickHandler);
      event.preventDefault();
      el.classList.remove('error');
      el.classList.add('loading');

      try {
        const res = await fetch(`${siteUrl}/members/api/session`, {
          method: 'DELETE',
        });
        if (res.ok) window.location.replace(siteUrl);
        else throw new Error('Signout failed');
      } catch {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
      }
    };
    el.addEventListener('click', clickHandler);
  };

  const hasRetentionOffers = offers.some(
    (offer) => offer.redemption_type === 'retention'
  );

  const addCancelSubscriptionHandler = (el) => {
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
      if (errorEl) errorEl.innerText = '';

      try {
        const identity = await fetchIdentity(siteUrl);
        const res = await cancelSubscription(siteUrl, identity, subscriptionId);
        if (res.ok) window.location.reload();
        else throw new Error('Cancel failed');
      } catch {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) errorEl.innerText = t('There was an error cancelling your subscription, please try again.');
      }
    };
    el.addEventListener('click', clickHandler);
  };

  const addContinueSubscriptionHandler = (el) => {
    const errorEl = el.parentElement.querySelector('[data-members-error]');
    const clickHandler = async (event) => {
      el.removeEventListener('click', clickHandler);
      event.preventDefault();
      el.classList.remove('error');
      el.classList.add('loading');
      const subscriptionId = el.dataset.membersContinueSubscription;
      if (errorEl) errorEl.innerText = '';

      try {
        const identity = await fetchIdentity(siteUrl);
        const res = await continueSubscription(siteUrl, identity, subscriptionId);
        if (res.ok) window.location.reload();
        else throw new Error('Continue failed');
      } catch {
        el.addEventListener('click', clickHandler);
        el.classList.remove('loading');
        el.classList.add('error');
        if (errorEl) errorEl.innerText = t('There was an error continuing your subscription, please try again.');
      }
    };
    el.addEventListener('click', clickHandler);
  };

  document.querySelectorAll('form[data-members-form]').forEach(addFormHandler);
  document.querySelectorAll('[data-members-plan]').forEach(addPlanHandler);
  document.querySelectorAll('[data-members-edit-billing]').forEach(addBillingEditHandler);
  document.querySelectorAll('[data-members-manage-billing]').forEach(addBillingPortalHandler);
  document.querySelectorAll('[data-members-signout]').forEach(addSignoutHandler);
  document.querySelectorAll('[data-members-cancel-subscription]').forEach(addCancelSubscriptionHandler);
  document.querySelectorAll('[data-members-continue-subscription]').forEach(addContinueSubscriptionHandler);
}
```