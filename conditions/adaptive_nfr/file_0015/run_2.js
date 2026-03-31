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

function buildActionError(action, state, message, autoHide = false) {
    return {
        action,
        popupNotification: createErrorNotification({action, state, message, autoHide})
    };
}

function buildActionSuccess(action, state, message, extras = {}) {
    return {
        action,
        popupNotification: createSuccessNotification({action, state, message}),
        ...extras
    };
}

// ─── Magic Link Page State ────────────────────────────────────────────────────

function buildMagicLinkState({lastPage, inboxLinks, otcRef, email, pageData}) {
    return {
        page: 'magiclink',
        lastPage,
        inboxLinks,
        ...(otcRef ? {otcRef} : {}),
        pageData: {
            ...(pageData || {}),
            email: (email || '').trim()
        }
    };
}

// ─── Tier/Cadence Resolution ──────────────────────────────────────────────────

function resolveTierCadence({tierId, cadence, plan, site}) {
    if (tierId && cadence) {
        return {tierId, cadence};
    }
    return getProductCadenceFromPrice({site, priceId: plan});
}

// ─── UI Actions ───────────────────────────────────────────────────────────────

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
    const {action = 'showPopupNotification:success', message = ''} = data;
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
        return buildActionError('signout:failed', state, t('Failed to log out, please try again'));
    }
}

async function signin({data, api, state}) {
    try {
        const integrityToken = await api.member.getIntegrityToken();
        const {otc_ref: otcRef, inboxLinks} = await api.member.sendMagicLink({
            ...data,
            emailType: 'signin',
            integrityToken,
            includeOTC: true
        });
        return buildMagicLinkState({
            lastPage: 'signin',
            inboxLinks,
            otcRef,
            email: data?.email,
            pageData: state.pageData
        });
    } catch (e) {
        return buildActionError(
            'signin:failed', state,
            chooseBestErrorMessage(e, t('Failed to log in, please try again'))
        );
    }
}

function startSigninOTCFromCustomForm({data, state}) {
    const {otcRef, inboxLinks} = data;
    if (!otcRef) {
        return {};
    }
    return {
        showPopup: true,
        popupNotification: null,
        ...buildMagicLinkState({
            lastPage: 'signin',
            inboxLinks,
            otcRef,
            email: data?.email,
            pageData: state.pageData
        })
    };
}

async function verifyOTC({data, api}) {
    const genericErrorMessage = t('Failed to verify code, please try again');
    try {
        const integrityToken = await api.member.getIntegrityToken();
        const response = await api.member.verifyOTC({...data, integrityToken});

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

// ─── Signup / Checkout ────────────────────────────────────────────────────────

async function signup({data, state, api}) {
    try {
        let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        name = name?.trim();

        if (plan.toLowerCase() === 'free') {
            const integrityToken = await api.member.getIntegrityToken();
            const {inboxLinks} = await api.member.sendMagicLink({emailType: 'signup', integrityToken, ...data, name});
            return buildMagicLinkState({lastPage: 'signup', inboxLinks, email, pageData: state.pageData});
        }

        ({tierId, cadence} = resolveTierCadence({tierId, cadence, plan, site: state?.site}));
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
        return {page: 'loading'};
    } catch (e) {
        return buildActionError(
            'signup:failed', state,
            chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
        );
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = resolveTierCadence({...data, site: state?.site});
        await api.member.checkoutPlan({plan, tierId, cadence, offerId, metadata: {checkoutType: 'upgrade'}});
    } catch (e) {
        return buildActionError('checkoutPlan:failed', state, t('Failed to process checkout, please try again'));
    }
}

// ─── Subscription Actions ─────────────────────────────────────────────────────

async function fetchMemberAndBuildSuccess({api, action, state, message, extras = {}}) {
    const member = await api.member.sessionData();
    return buildActionSuccess(action, state, message, {page: 'accountHome', member, ...extras});
}

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});
        await api.member.updateSubscription({planName: plan, tierId, cadence, subscriptionId, cancelAtPeriodEnd, planId});
        return fetchMemberAndBuildSuccess({
            api, state,
            action: 'updateSubscription:success',
            message: t('Subscription plan updated successfully')
        });
    } catch (e) {
        return buildActionError('updateSubscription:failed', state, t('Failed to update subscription, please try again'));
    }
}

async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        const member = await api.member.sessionData();
        return {action: 'cancelSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return buildActionError('cancelSubscription:failed', state, t('Failed to cancel subscription, please try again'));
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        const member = await api.member.sessionData();
        return {action: 'continueSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return buildActionError('continueSubscription:failed', state, t('Failed to cancel subscription, please try again'));
    }
}

async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({offerId, subscriptionId});
        return fetchMemberAndBuildSuccess({
            api, state,
            action: 'applyOffer:success',
            message: 'Offer applied successfully!',
            extras: {offers: []}
        });
    } catch (e) {
        return buildActionError('applyOffer:failed', state, 'Failed to apply offer, please try again');
    }
}

// ─── Billing Actions ──────────────────────────────────────────────────────────

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return buildActionError('editBilling:failed', state, t('Failed to update billing information, please try again'));
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return buildActionError('manageBilling:failed', state, t('Failed to open billing portal, please try again'));
    }
}

// ─── Newsletter Actions ───────────────────────────────────────────────────────

async function updateNewsletterPreference({data, state, api}) {
    try {
        const {newsletters, enableCommentNotifications} = data;
        if (!newsletters && enableCommentNotifications === undefined) {
            return {};
        }
        const updateData = {
            ...(newsletters ? {newsletters} : {}),
            ...(enableCommentNotifications !== undefined ? {enableCommentNotifications} : {})
        };
        const member = await api.member.update(updateData);
        return {action: 'updateNewsletterPref:success', member};
    } catch (e) {
        return buildActionError('updateNewsletter:failed', state, t('Failed to update newsletter settings'), true);
    }
}

async function updateNewsletter({data, state, api}) {
    try {
        const member = await api.member.update({subscribed: data.subscribed});
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        return buildActionSuccess('updateNewsletter:success', state, t('Email newsletter settings updated'), {member});
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
        return buildActionSuccess(
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

// ─── Profile Actions ──────────────────────────────────────────────────────────

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
        const member = await api.member.sessionData();
        return member
            ? {member, success: true, action: 'refreshMemberData:success'}
            : null;
    } catch (err) {
        return {success: false, error: err, action: 'refreshMemberData:failed'};
    }
}

function buildProfileNotification({action, success, message, state, autoHide}) {
    return createPopupNotification({
        type: action,
        autoHide: autoHide ?? success,
        closeable: true,
        status: success ? 'success' : 'error',
        state,
        message
    });
}

async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    const memberExtra = (update) => update?.success ? {member: update.member} : {};
    const pageExtra = (success) => success ? {page: 'accountHome'} : {};

    if (dataUpdate && emailUpdate) {
        if (emailUpdate.success) {
            return {
                action: 'updateProfile:success',
                ...memberExtra(dataUpdate),
                ...pageExtra(true),
                popupNotification: buildProfileNotification({
                    action: 'updateProfile:success', success: true,
                    message: t('Check your inbox to verify email update'), state, autoHide: true
                })
            };