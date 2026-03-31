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

function failedAction(action, state, message, autoHide = false) {
    return {
        action,
        popupNotification: createErrorNotification({action, state, message, autoHide})
    };
}

// ─── Subscription Helpers ────────────────────────────────────────────────────

function resolveTierCadence({data, state}) {
    let {plan, tierId, cadence} = data;
    if (!tierId || !cadence) {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
    }
    return {plan, tierId, cadence};
}

async function fetchMemberAndReturn({api, action, state, extra = {}}) {
    const member = await api.member.sessionData();
    return {
        action,
        page: 'accountHome',
        member,
        ...extra
    };
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
        return failedAction('signout:failed', state, t('Failed to log out, please try again'));
    }
}

function buildMagicLinkPageState({state, email, lastPage, otcRef, inboxLinks}) {
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

async function signin({data, api, state}) {
    try {
        const integrityToken = await api.member.getIntegrityToken();
        const {otc_ref: otcRef, inboxLinks} = await api.member.sendMagicLink({
            ...data,
            emailType: 'signin',
            integrityToken,
            includeOTC: true
        });
        return buildMagicLinkPageState({state, email: data?.email, lastPage: 'signin', otcRef, inboxLinks});
    } catch (e) {
        return failedAction('signin:failed', state, chooseBestErrorMessage(e, t('Failed to log in, please try again')));
    }
}

function startSigninOTCFromCustomForm({data, state}) {
    const otcRef = data?.otcRef;
    if (!otcRef) {
        return {};
    }
    return {
        showPopup: true,
        popupNotification: null,
        ...buildMagicLinkPageState({
            state,
            email: data?.email,
            lastPage: 'signin',
            otcRef,
            inboxLinks: data?.inboxLinks
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

// ─── Signup & Checkout ────────────────────────────────────────────────────────

async function signup({data, state, api}) {
    try {
        let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        name = name?.trim();

        if (plan.toLowerCase() === 'free') {
            const integrityToken = await api.member.getIntegrityToken();
            const {inboxLinks} = await api.member.sendMagicLink({emailType: 'signup', integrityToken, ...data, name});
            return buildMagicLinkPageState({state, email, lastPage: 'signup', inboxLinks});
        }

        if (!tierId || !cadence) {
            ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
        }
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
        return {page: 'loading'};
    } catch (e) {
        return failedAction('signup:failed', state, chooseBestErrorMessage(e, t('Failed to sign up, please try again')));
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = resolveTierCadence({data, state});
        await api.member.checkoutPlan({plan, tierId, cadence, offerId, metadata: {checkoutType: 'upgrade'}});
    } catch (e) {
        return failedAction('checkoutPlan:failed', state, t('Failed to process checkout, please try again'));
    }
}

// ─── Subscription Management ──────────────────────────────────────────────────

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

        await api.member.updateSubscription({planName: plan, tierId, cadence, subscriptionId, cancelAtPeriodEnd, planId});

        const action = 'updateSubscription:success';
        return {
            ...(await fetchMemberAndReturn({api, action, state})),
            popupNotification: createSuccessNotification({action, state, message: t('Subscription plan updated successfully')})
        };
    } catch (e) {
        return failedAction('updateSubscription:failed', state, t('Failed to update subscription, please try again'));
    }
}

async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        return fetchMemberAndReturn({api, action: 'cancelSubscription:success', state});
    } catch (e) {
        return failedAction('cancelSubscription:failed', state, t('Failed to cancel subscription, please try again'));
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        return fetchMemberAndReturn({api, action: 'continueSubscription:success', state});
    } catch (e) {
        return failedAction('continueSubscription:failed', state, t('Failed to cancel subscription, please try again'));
    }
}

async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({offerId, subscriptionId});
        const action = 'applyOffer:success';
        return {
            ...(await fetchMemberAndReturn({api, action, state})),
            offers: [],
            popupNotification: createSuccessNotification({action, state, message: 'Offer applied successfully!'})
        };
    } catch (e) {
        return failedAction('applyOffer:failed', state, 'Failed to apply offer, please try again');
    }
}

// ─── Billing ──────────────────────────────────────────────────────────────────

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return failedAction('editBilling:failed', state, t('Failed to update billing information, please try again'));
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return failedAction('manageBilling:failed', state, t('Failed to open billing portal, please try again'));
    }
}

// ─── Newsletter & Email ───────────────────────────────────────────────────────

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
        return failedAction('updateNewsletterPref:failed', state, t('Failed to update newsletter settings'), true);
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        const action = 'removeEmailFromSuppressionList:success';
        return {
            action,
            popupNotification: createSuccessNotification({action, state, message: t('You have been successfully resubscribed')})
        };
    } catch (e) {
        const action = 'removeEmailFromSuppressionList:failed';
        return {
            action,
            popupNotification: createErrorNotification({action, state, message: t('Your email has failed to resubscribe, please try again'), autoHide: true})
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
            popupNotification: createSuccessNotification({action, state, message: t('Email newsletter settings updated')})
        };
    } catch (e) {
        const action = 'updateNewsletter:failed';
        return {
            action,
            popupNotification: createErrorNotification({action, state, message: t('Failed to update newsletter settings'), autoHide: true})
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
        const member = await api.member.sessionData();
        return member
            ? {member, success: true, action: 'refreshMemberData:success'}
            : null;
    } catch (err) {
        return {success: false, error: err, action: 'refreshMemberData:failed'};
    }
}

function buildProfileNotification({action, success, message, state}) {
    return createPopupNotification({
        type: action, autoHide: success, closeable: true,
        status: success ? 'success' : 'error', state, message
    });
}

function buildProfileResult({action, success, member, page, message, state}) {
    return {
        action,
        ...(member ? {member} : {}),
        ...(page ? {page} : {}),
        popupNotification: buildProfileNotification({action, success, message, state})
    };
}

async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    const member = dataUpdate?.success ? dataUpdate.member : undefined;

    if (dataUpdate && emailUpdate) {
        if (emailUpdate.success) {
            return buildProfileResult({
                action: 'updateProfile:success', success: true, member,
                page: 'accountHome', state,
                message: t('Check your inbox to verify email update')
            });
        }
        const message = !dataUpdate.success
            ? t('Failed to update account data')
            : t('Failed to send verification email');
        return buildProfileResult({action: '