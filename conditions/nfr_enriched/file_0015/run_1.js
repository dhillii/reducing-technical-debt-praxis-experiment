```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// ─── Notification Helpers ────────────────────────────────────────────────────

function createErrorNotification({action, state, message, autoHide = false}) {
    return createPopupNotification({
        type: action, autoHide, closeable: true, state, status: 'error', message
    });
}

function createSuccessNotification({action, state, message, autoHide = true}) {
    return createPopupNotification({
        type: action, autoHide, closeable: true, state, status: 'success', message
    });
}

function buildFailureResult(action, state, message, autoHide = false) {
    return {
        action,
        popupNotification: createErrorNotification({action, state, message, autoHide})
    };
}

function buildSuccessResult(action, state, message, extras = {}) {
    return {
        action,
        popupNotification: createSuccessNotification({action, state, message}),
        ...extras
    };
}

// ─── Tiered/Cadence Resolution ───────────────────────────────────────────────

function resolveTierAndCadence({plan, tierId, cadence, site}) {
    if (tierId && cadence) {
        return {tierId, cadence};
    }
    return getProductCadenceFromPrice({site, priceId: plan});
}

// ─── Member Data Helpers ─────────────────────────────────────────────────────

async function fetchSessionMember(api) {
    return api.member.sessionData();
}

async function withIntegrityToken(api, payload) {
    const integrityToken = await api.member.getIntegrityToken();
    return {...payload, integrityToken};
}

// ─── UI Actions ──────────────────────────────────────────────────────────────

function switchPage({data, state}) {
    return {
        page: data.page,
        popupNotification: null,
        lastPage: data.lastPage || null,
        pageData: data.pageData || state.pageData
    };
}

function togglePopup({state}) {
    return {showPopup: !state.showPopup};
}

function openPopup({data}) {
    return {
        showPopup: true,
        page: data.page,
        ...(data.pageQuery ? {pageQuery: data.pageQuery} : {}),
        ...(data.pageData ? {pageData: data.pageData} : {})
    };
}

function back({state}) {
    return state.lastPage ? {page: state.lastPage} : closePopup({state});
}

function closePopup({state}) {
    removePortalLinkFromUrl();
    return {
        showPopup: false,
        lastPage: null,
        pageQuery: '',
        popupNotification: null,
        page: state.page === 'magiclink' ? '' : state.page
    };
}

function openNotification({data}) {
    return {showNotification: true, ...data};
}

function closeNotification() {
    return {showNotification: false};
}

function clearPopupNotification() {
    return {popupNotification: null};
}

async function showPopupNotification({data, state}) {
    const action = data.action || 'showPopupNotification:success';
    const message = data.message || '';
    return {
        popupNotification: createSuccessNotification({action, state, message})
    };
}

// ─── Auth Actions ─────────────────────────────────────────────────────────────

async function signout({api, state}) {
    try {
        await api.member.signout();
        return {action: 'signout:success'};
    } catch (e) {
        return buildFailureResult('signout:failed', state, t('Failed to log out, please try again'));
    }
}

async function signin({data, api, state}) {
    try {
        const payload = await withIntegrityToken(api, {
            ...data,
            emailType: 'signin',
            includeOTC: true
        });
        const {otc_ref: otcRef, inboxLinks} = await api.member.sendMagicLink(payload);
        return {
            page: 'magiclink',
            lastPage: 'signin',
            ...(otcRef ? {otcRef} : {}),
            inboxLinks,
            pageData: {
                ...(state.pageData || {}),
                email: (data?.email || '').trim()
            }
        };
    } catch (e) {
        return buildFailureResult(
            'signin:failed', state,
            chooseBestErrorMessage(e, t('Failed to log in, please try again'))
        );
    }
}

function startSigninOTCFromCustomForm({data, state}) {
    const otcRef = data?.otcRef;
    if (!otcRef) {
        return {};
    }
    return {
        showPopup: true,
        page: 'magiclink',
        lastPage: 'signin',
        otcRef,
        inboxLinks: data?.inboxLinks,
        pageData: {
            ...(state.pageData || {}),
            email: (data?.email || '').trim()
        },
        popupNotification: null
    };
}

async function verifyOTC({data, api}) {
    const genericErrorMessage = t('Failed to verify code, please try again');
    try {
        const payload = await withIntegrityToken(api, data);
        const response = await api.member.verifyOTC(payload);

        if (response.redirectUrl) {
            return window.location.assign(response.redirectUrl);
        }
        return {
            action: 'verifyOTC:failed',
            actionErrorMessage: chooseBestErrorMessage(response.errors?.[0], genericErrorMessage)
        };
    } catch (e) {
        return {
            action: 'verifyOTC:failed',
            actionErrorMessage: chooseBestErrorMessage(e, genericErrorMessage)
        };
    }
}

// ─── Signup & Checkout ────────────────────────────────────────────────────────

async function signup({data, state, api}) {
    try {
        let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        name = name?.trim();

        if (plan.toLowerCase() === 'free') {
            const payload = await withIntegrityToken(api, {...data, name, emailType: 'signup'});
            const {inboxLinks} = await api.member.sendMagicLink(payload);
            return {
                page: 'magiclink',
                lastPage: 'signup',
                inboxLinks,
                pageData: {
                    ...(state.pageData || {}),
                    email: (email || '').trim()
                }
            };
        }

        ({tierId, cadence} = resolveTierAndCadence({plan, tierId, cadence, site: state?.site}));
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
        return {page: 'loading'};
    } catch (e) {
        return buildFailureResult(
            'signup:failed', state,
            chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
        );
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = resolveTierAndCadence({...data, site: state?.site});
        await api.member.checkoutPlan({
            plan, tierId, cadence, offerId,
            metadata: {checkoutType: 'upgrade'}
        });
    } catch (e) {
        return buildFailureResult(
            'checkoutPlan:failed', state,
            t('Failed to process checkout, please try again')
        );
    }
}

// ─── Subscription Actions ─────────────────────────────────────────────────────

async function withSubscriptionUpdate(actionName, apiCall, {state, api, successMessage, failureMessage}) {
    try {
        await apiCall();
        const member = await fetchSessionMember(api);
        return buildSuccessResult(actionName, state, successMessage, {page: 'accountHome', member});
    } catch (e) {
        return buildFailureResult(`${actionName}:failed`, state, failureMessage);
    }
}

async function updateSubscription({data, state, api}) {
    const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
    const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

    return withSubscriptionUpdate('updateSubscription', () =>
        api.member.updateSubscription({
            planName: plan, tierId, cadence, subscriptionId, cancelAtPeriodEnd, planId
        }),
        {
            state, api,
            successMessage: t('Subscription plan updated successfully'),
            failureMessage: t('Failed to update subscription, please try again')
        }
    );
}

async function cancelSubscription({data, state, api}) {
    const {subscriptionId, cancellationReason} = data;
    try {
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        const member = await fetchSessionMember(api);
        return {action: 'cancelSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return buildFailureResult(
            'cancelSubscription:failed', state,
            t('Failed to cancel subscription, please try again')
        );
    }
}

async function continueSubscription({data, state, api}) {
    const {subscriptionId} = data;
    try {
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        const member = await fetchSessionMember(api);
        return {action: 'continueSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return buildFailureResult(
            'continueSubscription:failed', state,
            t('Failed to cancel subscription, please try again')
        );
    }
}

async function applyOffer({data, state, api}) {
    try {
        await api.member.applyOffer({offerId: data.offerId, subscriptionId: data.subscriptionId});
        const member = await fetchSessionMember(api);
        return buildSuccessResult('applyOffer:success', state, 'Offer applied successfully!', {
            page: 'accountHome', member, offers: []
        });
    } catch (e) {
        return buildFailureResult('applyOffer:failed', state, 'Failed to apply offer, please try again');
    }
}

// ─── Billing Actions ──────────────────────────────────────────────────────────

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return buildFailureResult(
            'editBilling:failed', state,
            t('Failed to update billing information, please try again')
        );
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return buildFailureResult(
            'manageBilling:failed', state,
            t('Failed to open billing portal, please try again')
        );
    }
}

// ─── Newsletter Actions ───────────────────────────────────────────────────────

async function updateNewsletterPreference({data, state, api}) {
    const {newsletters, enableCommentNotifications} = data;
    if (!newsletters && enableCommentNotifications === undefined) {
        return {};
    }

    try {
        const updateData = {
            ...(newsletters ? {newsletters} : {}),
            ...(enableCommentNotifications !== undefined ? {enableCommentNotifications} : {})
        };
        const member = await api.member.update(updateData);
        return {action: 'updateNewsletterPref:success', member};
    } catch (e) {
        return buildFailureResult(
            'updateNewsletter:failed', state,
            t('Failed to update newsletter settings'),
            true
        );
    }
}

async function updateNewsletter({data, state, api}) {
    try {
        const member = await api.member.update({subscribed: data.subscribed});
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        return buildSuccessResult(
            'updateNewsletter:success', state,
            t('Email newsletter settings updated'),
            {member}
        );
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: createErrorNotification({
                action: 'updateNewsletter:failed', state,
                message: t('Failed to update newsletter settings'),
                autoHide: true
            })
        };
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        return buildSuccessResult(
            'removeEmailFromSuppressionList:success', state,
            t('You have been successfully resubscribed')
        );
    } catch (e) {
        return {
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createErrorNotification({
                action: 'removeEmailFromSuppressionList:failed', state,
                message: t('Your email has failed to resubscribe, please try again'),
                autoHide: true
            })
        };
    }
}

// ─── Profile Update ───────────────────────────────────────────────────────────

async function updateMemberEmail({data, state, api}) {
    const {email} = data;
    if (email === getMemberEmail({member: state.member})) {
        return null;
    }
    try {
        await api.member.updateEmailAddress({email});
        return {success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

async function updateMemberData({data, state, api}) {
    const name = data?.name?.trim();
    if (name === getMemberName({member: state.member})) {
        return null;
    }
    try {
        const member = await api.member.update({name});
        if (!member) {
            throw new Error('Failed to update member');
        }
        return {member, success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

async function refreshMemberData({state, api}) {
    if (!state.member) {
        return null;
    }
    try {
        const member = await fetchSessionMember(api);
        return member
            ? {member, success: true, action: 'refreshMemberData:success'}
            : null;
    } catch (err) {
        return {success: false, error: err, action: 'refreshMemberData:failed'};
    }
}

function buildProfileUpdateResult({dataUpdate, emailUpdate, state}) {
    const hasData = Boolean(dataUpdate);
    const hasEmail = Boolean(emailUpdate);

    if (hasData && hasEmail) {
        if (emailUpdate.success) {
            return {
                action: 'updateProfile:success',
                ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
                page: 'accountHome',
                popupNotification: createSuccessNotification({
                    action: 'updateProfile:success', state,
                    message: t('Check your inbox to verify email update')
                })
            };
        }
        const message = !dataUpdate.success
            ? t('