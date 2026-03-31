```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// ─── Notification Helpers ────────────────────────────────────────────────────

function createErrorNotification(type, message, state) {
    return createPopupNotification({type, autoHide: false, closeable: true, state, status: 'error', message});
}

function createSuccessNotification(type, message, state) {
    return createPopupNotification({type, autoHide: true, closeable: true, state, status: 'success', message});
}

function buildActionError(action, message, state) {
    return {
        action: `${action}:failed`,
        popupNotification: createErrorNotification(`${action}:failed`, message, state)
    };
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

function back({state}) {
    return state.lastPage ? {page: state.lastPage} : closePopup({state});
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
        popupNotification: createSuccessNotification(action, message, state)
    };
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
        return {action: 'signout:success'};
    } catch (e) {
        return buildActionError('signout', t('Failed to log out, please try again'), state);
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
        return buildActionError('signin', chooseBestErrorMessage(e, t('Failed to log in, please try again')), state);
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
        ...buildMagicLinkResult({lastPage: 'signin', otcRef, inboxLinks, email: data?.email, state})
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

// ─── Subscription / Checkout ─────────────────────────────────────────────────

function resolveProductCadence({data, state}) {
    let {plan, tierId, cadence} = data;
    if (!tierId || !cadence) {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
    }
    return {tierId, cadence};
}

async function signup({data, state, api}) {
    try {
        let {plan, email, name, newsletters, offerId} = data;
        name = name?.trim();

        if (plan.toLowerCase() === 'free') {
            const integrityToken = await api.member.getIntegrityToken();
            const {inboxLinks} = await api.member.sendMagicLink({emailType: 'signup', integrityToken, ...data, name});
            return buildMagicLinkResult({lastPage: 'signup', inboxLinks, email, state});
        }

        const {tierId, cadence} = resolveProductCadence({data, state});
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
        return {page: 'loading'};
    } catch (e) {
        return buildActionError('signup', chooseBestErrorMessage(e, t('Failed to sign up, please try again')), state);
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = resolveProductCadence({data, state});
        await api.member.checkoutPlan({plan, tierId, cadence, offerId, metadata: {checkoutType: 'upgrade'}});
    } catch (e) {
        return buildActionError('checkoutPlan', t('Failed to process checkout, please try again'), state);
    }
}

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

        await api.member.updateSubscription({planName: plan, tierId, cadence, subscriptionId, cancelAtPeriodEnd, planId});
        const member = await api.member.sessionData();
        const action = 'updateSubscription:success';
        return {
            action,
            page: 'accountHome',
            member,
            popupNotification: createSuccessNotification(action, t('Subscription plan updated successfully'), state)
        };
    } catch (e) {
        return buildActionError('updateSubscription', t('Failed to update subscription, please try again'), state);
    }
}

async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        const member = await api.member.sessionData();
        return {action: 'cancelSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return buildActionError('cancelSubscription', t('Failed to cancel subscription, please try again'), state);
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        const member = await api.member.sessionData();
        return {action: 'continueSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return buildActionError('continueSubscription', t('Failed to cancel subscription, please try again'), state);
    }
}

async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({offerId, subscriptionId});
        const member = await api.member.sessionData();
        const action = 'applyOffer:success';
        return {
            action,
            page: 'accountHome',
            member,
            offers: [],
            popupNotification: createSuccessNotification(action, 'Offer applied successfully!', state)
        };
    } catch (e) {
        return buildActionError('applyOffer', 'Failed to apply offer, please try again', state);
    }
}

// ─── Billing ─────────────────────────────────────────────────────────────────

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return buildActionError('editBilling', t('Failed to update billing information, please try again'), state);
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return buildActionError('manageBilling', t('Failed to open billing portal, please try again'), state);
    }
}

// ─── Newsletter ───────────────────────────────────────────────────────────────

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
        return {
            action: 'updateNewsletterPref:failed',
            popupNotification: createErrorNotification('updateNewsletter:failed', t('Failed to update newsletter settings'), state)
        };
    }
}

async function updateNewsletter({data, state, api}) {
    try {
        const member = await api.member.update({subscribed: data.subscribed});
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        const action = 'updateNewsletter:success';
        return {
            action,
            member,
            popupNotification: createSuccessNotification(action, t('Email newsletter settings updated'), state)
        };
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: createErrorNotification('updateNewsletter:failed', t('Failed to update newsletter settings'), state)
        };
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        const action = 'removeEmailFromSuppressionList:success';
        return {
            action,
            popupNotification: createSuccessNotification(action, t('You have been successfully resubscribed'), state)
        };
    } catch (e) {
        return {
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createErrorNotification(
                'removeEmailFromSuppressionList:failed',
                t('Your email has failed to resubscribe, please try again'),
                state
            )
        };
    }
}

// ─── Profile ─────────────────────────────────────────────────────────────────

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
            ? {member, success: true, action: 'refreshMemberData:success'}
            : null;
    } catch (error) {
        return {success: false, error, action: 'refreshMemberData:failed'};
    }
}

function buildProfileNotification({action, autoHide, status, message, state}) {
    return createPopupNotification({type: action, autoHide, closeable: true, status, state, message});
}

async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    const memberPatch = (update) => (update?.success ? {member: update.member} : {});

    if (dataUpdate && emailUpdate) {
        if (emailUpdate.success) {
            return {
                action: 'updateProfile:success',
                ...memberPatch(dataUpdate),
                page: 'accountHome',
                popupNotification: buildProfileNotification({
                    action: 'updateProfile:success', autoHide: true, status: 'success',
                    message: t('Check your inbox to verify email update'), state
                })
            };
        }
        const message = !dataUpdate.success
            ? t('Failed to update account data')
            : t('Failed to send verification email');
        return {
            action: 'updateProfile:failed',
            ...memberPatch(dataUpdate),
            popupNotification: buildProfileNotification({
                action: 'updateProfile:failed', autoHide: true, status: 'error', message, state
            })
        };
    }

    if (dataUpdate) {
        const success = dataUpdate.success;
        const action = success ? 'updateProfile:success' : 'updateProfile:failed';
        const message = success
            ? t('Account details updated successfully')
            : t('Failed to update account details');
        return {
            action,
            ...memberPatch(dataUpdate),
            ...(success ? {page: 'accountHome'} : {}),
            popup