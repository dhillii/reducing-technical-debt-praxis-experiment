```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// ─── Notification Helpers ────────────────────────────────────────────────────

function createErrorNotification({type, state, message, autoHide = false}) {
    return createPopupNotification({type, autoHide, closeable: true, state, status: 'error', message});
}

function createSuccessNotification({type, state, message, autoHide = true}) {
    return createPopupNotification({type, autoHide, closeable: true, state, status: 'success', message});
}

function buildActionError(action, notification) {
    return {action: `${action}:failed`, popupNotification: notification};
}

function buildActionSuccess(action, extras = {}) {
    return {action: `${action}:success`, ...extras};
}

// ─── Popup / Navigation ──────────────────────────────────────────────────────

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

// ─── Magic Link Helpers ──────────────────────────────────────────────────────

function buildMagicLinkResult({lastPage, otcRef, inboxLinks, email, state}) {
    return {
        page: 'magiclink',
        lastPage,
        ...(otcRef ? {otcRef} : {}),
        inboxLinks,
        pageData: {
            ...(state.pageData || {}),
            email: (email || '').trim()
        }
    };
}

// ─── Auth Actions ────────────────────────────────────────────────────────────

async function signout({api, state}) {
    try {
        await api.member.signout();
        return buildActionSuccess('signout');
    } catch (e) {
        return buildActionError('signout', createErrorNotification({
            type: 'signout:failed', state,
            message: t('Failed to log out, please try again')
        }));
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
        return buildMagicLinkResult({lastPage: 'signin', otcRef, inboxLinks, email: data?.email, state});
    } catch (e) {
        return buildActionError('signin', createErrorNotification({
            type: 'signin:failed', state,
            message: chooseBestErrorMessage(e, t('Failed to log in, please try again'))
        }));
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
        ...buildMagicLinkResult({
            lastPage: 'signin',
            otcRef,
            inboxLinks,
            email: data?.email,
            state
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

// ─── Signup / Checkout ───────────────────────────────────────────────────────

async function resolveCheckoutParams({data, state, api}) {
    let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
    if (!tierId || !cadence) {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
    }
    await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
}

async function signup({data, state, api}) {
    try {
        let {plan, email, name, newsletters} = data;
        name = name?.trim();

        if (plan.toLowerCase() === 'free') {
            const integrityToken = await api.member.getIntegrityToken();
            const {inboxLinks} = await api.member.sendMagicLink({emailType: 'signup', integrityToken, ...data, name});
            return buildMagicLinkResult({lastPage: 'signup', inboxLinks, email, state});
        }

        await resolveCheckoutParams({data: {...data, name}, state, api});
        return {page: 'loading'};
    } catch (e) {
        return buildActionError('signup', createErrorNotification({
            type: 'signup:failed', state,
            message: chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
        }));
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        let {plan, offerId, tierId, cadence} = data;
        if (!tierId || !cadence) {
            ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
        }
        await api.member.checkoutPlan({plan, tierId, cadence, offerId, metadata: {checkoutType: 'upgrade'}});
    } catch (e) {
        return buildActionError('checkoutPlan', createErrorNotification({
            type: 'checkoutPlan:failed', state,
            message: t('Failed to process checkout, please try again')
        }));
    }
}

// ─── Subscription Actions ────────────────────────────────────────────────────

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

        await api.member.updateSubscription({planName: plan, tierId, cadence, subscriptionId, cancelAtPeriodEnd, planId});
        const member = await api.member.sessionData();

        return buildActionSuccess('updateSubscription', {
            page: 'accountHome',
            member,
            popupNotification: createSuccessNotification({
                type: 'updateSubscription:success', state,
                message: t('Subscription plan updated successfully')
            })
        });
    } catch (e) {
        return buildActionError('updateSubscription', createErrorNotification({
            type: 'updateSubscription:failed', state,
            message: t('Failed to update subscription, please try again')
        }));
    }
}

async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        const member = await api.member.sessionData();
        return buildActionSuccess('cancelSubscription', {page: 'accountHome', member});
    } catch (e) {
        return buildActionError('cancelSubscription', createErrorNotification({
            type: 'cancelSubscription:failed', state,
            message: t('Failed to cancel subscription, please try again')
        }));
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        const member = await api.member.sessionData();
        return buildActionSuccess('continueSubscription', {page: 'accountHome', member});
    } catch (e) {
        return buildActionError('continueSubscription', createErrorNotification({
            type: 'continueSubscription:failed', state,
            message: t('Failed to cancel subscription, please try again')
        }));
    }
}

async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({offerId, subscriptionId});
        const member = await api.member.sessionData();
        return buildActionSuccess('applyOffer', {
            page: 'accountHome',
            member,
            offers: [],
            popupNotification: createSuccessNotification({
                type: 'applyOffer:success', state,
                message: 'Offer applied successfully!'
            })
        });
    } catch (e) {
        return buildActionError('applyOffer', createErrorNotification({
            type: 'applyOffer:failed', state,
            message: 'Failed to apply offer, please try again'
        }));
    }
}

// ─── Billing Actions ─────────────────────────────────────────────────────────

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return buildActionError('editBilling', createErrorNotification({
            type: 'editBilling:failed', state,
            message: t('Failed to update billing information, please try again')
        }));
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return buildActionError('manageBilling', createErrorNotification({
            type: 'manageBilling:failed', state,
            message: t('Failed to open billing portal, please try again')
        }));
    }
}

// ─── Notification Actions ────────────────────────────────────────────────────

async function clearPopupNotification() {
    return {popupNotification: null};
}

async function showPopupNotification({data, state}) {
    const {message = '', action = 'showPopupNotification:success'} = data;
    return {
        popupNotification: createSuccessNotification({type: action, state, message})
    };
}

// ─── Newsletter / Profile Actions ────────────────────────────────────────────

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
        return buildActionSuccess('updateNewsletterPref', {member});
    } catch (e) {
        return buildActionError('updateNewsletterPref', createErrorNotification({
            type: 'updateNewsletter:failed', state, autoHide: true,
            message: t('Failed to update newsletter settings')
        }));
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        return buildActionSuccess('removeEmailFromSuppressionList', {
            popupNotification: createSuccessNotification({
                type: 'removeEmailFromSuppressionList:success', state,
                message: t('You have been successfully resubscribed')
            })
        });
    } catch (e) {
        return buildActionError('removeEmailFromSuppressionList', createErrorNotification({
            type: 'removeEmailFromSuppressionList:failed', state, autoHide: true,
            message: t('Your email has failed to resubscribe, please try again')
        }));
    }
}

async function updateNewsletter({data, state, api}) {
    try {
        const member = await api.member.update({subscribed: data.subscribed});
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        return buildActionSuccess('updateNewsletter', {
            member,
            popupNotification: createSuccessNotification({
                type: 'updateNewsletter:success', state,
                message: t('Email newsletter settings updated')
            })
        });
    } catch (e) {
        return buildActionError('updateNewsletter', createErrorNotification({
            type: 'updateNewsletter:failed', state, autoHide: true,
            message: t('Failed to update newsletter settings')
        }));
    }
}

// ─── Profile Update Helpers ──────────────────────────────────────────────────

async function updateMemberEmail({data, state, api}) {
    const {email} = data;
    if (email === getMemberEmail({member: state.member})) {
        return null;
    }
    try {
        await api.member.updateEmailAddress({email});
        return {success: true};
    } catch (error) {
        return {success: false, error};
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
    } catch (error) {
        return {success: false, error};
    }
}

async function refreshMemberData({state, api}) {
    if (!state.member) {
        return null;
    }
    try {
        const member = await api.member.sessionData();
        return member
            ? buildActionSuccess('refreshMemberData', {member, success: true})
            : null;
    } catch (error) {
        return {success: false, error, action: 'refreshMemberData:failed'};
    }
}

function buildProfileNotification({action, success, message, state}) {
    return createPopupNotification({
        type: action,
        autoHide: success,
        closeable: true,
        status: success ? 'success' : 'error',
        state,
        message
    });
}

async function updateProfile({data, state, api}) {
    const [dataUpdate,