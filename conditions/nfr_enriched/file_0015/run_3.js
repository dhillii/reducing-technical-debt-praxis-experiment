```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// ─── Notification Helpers ────────────────────────────────────────────────────

function createErrorNotification({action, state, message}) {
    return createPopupNotification({
        type: action, autoHide: false, closeable: true, state, status: 'error', message
    });
}

function createSuccessNotification({action, state, message}) {
    return createPopupNotification({
        type: action, autoHide: true, closeable: true, state, status: 'success', message
    });
}

function buildActionResult(action, extras = {}) {
    return {action, ...extras};
}

function buildErrorResult({action, state, message}) {
    return buildActionResult(`${action}:failed`, {
        popupNotification: createErrorNotification({action: `${action}:failed`, state, message})
    });
}

function buildSuccessResult({action, state, message, extras = {}}) {
    return buildActionResult(`${action}:success`, {
        popupNotification: createSuccessNotification({action: `${action}:success`, state, message}),
        ...extras
    });
}

// ─── Popup / Navigation Actions ──────────────────────────────────────────────

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
        popupNotification: createSuccessNotification({action, state, message})
    };
}

// ─── Magic Link Helpers ───────────────────────────────────────────────────────

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

// ─── Auth Actions ─────────────────────────────────────────────────────────────

async function signout({api, state}) {
    try {
        await api.member.signout();
        return buildActionResult('signout:success');
    } catch (e) {
        return buildErrorResult({
            action: 'signout',
            state,
            message: t('Failed to log out, please try again')
        });
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
        return buildMagicLinkResult({
            lastPage: 'signin',
            otcRef,
            inboxLinks,
            email: data?.email,
            state
        });
    } catch (e) {
        return buildErrorResult({
            action: 'signin',
            state,
            message: chooseBestErrorMessage(e, t('Failed to log in, please try again'))
        });
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
        ...buildMagicLinkResult({
            lastPage: 'signin',
            otcRef,
            inboxLinks: data?.inboxLinks,
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
        return buildActionResult('verifyOTC:failed', {
            actionErrorMessage: chooseBestErrorMessage(response.errors?.[0], genericErrorMessage)
        });
    } catch (e) {
        return buildActionResult('verifyOTC:failed', {
            actionErrorMessage: chooseBestErrorMessage(e, genericErrorMessage)
        });
    }
}

// ─── Subscription / Checkout Actions ─────────────────────────────────────────

function resolveTierCadence({plan, tierId, cadence, site}) {
    if (!tierId || !cadence) {
        return getProductCadenceFromPrice({site, priceId: plan});
    }
    return {tierId, cadence};
}

async function signup({data, state, api}) {
    try {
        let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        name = name?.trim();

        if (plan.toLowerCase() === 'free') {
            const integrityToken = await api.member.getIntegrityToken();
            const {inboxLinks} = await api.member.sendMagicLink({
                emailType: 'signup', integrityToken, ...data, name
            });
            return buildMagicLinkResult({lastPage: 'signup', inboxLinks, email, state});
        }

        ({tierId, cadence} = resolveTierCadence({plan, tierId, cadence, site: state?.site}));
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
        return {page: 'loading'};
    } catch (e) {
        return buildErrorResult({
            action: 'signup',
            state,
            message: chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
        });
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = resolveTierCadence({...data, site: state?.site});
        await api.member.checkoutPlan({plan, tierId, cadence, offerId, metadata: {checkoutType: 'upgrade'}});
    } catch (e) {
        return buildErrorResult({
            action: 'checkoutPlan',
            state,
            message: t('Failed to process checkout, please try again')
        });
    }
}

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

        await api.member.updateSubscription({
            planName: plan, tierId, cadence, subscriptionId, cancelAtPeriodEnd, planId
        });
        const member = await api.member.sessionData();
        return buildSuccessResult({
            action: 'updateSubscription',
            state,
            message: t('Subscription plan updated successfully'),
            extras: {page: 'accountHome', member}
        });
    } catch (e) {
        return buildErrorResult({
            action: 'updateSubscription',
            state,
            message: t('Failed to update subscription, please try again')
        });
    }
}

async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        const member = await api.member.sessionData();
        return buildActionResult('cancelSubscription:success', {page: 'accountHome', member});
    } catch (e) {
        return buildErrorResult({
            action: 'cancelSubscription',
            state,
            message: t('Failed to cancel subscription, please try again')
        });
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        const member = await api.member.sessionData();
        return buildActionResult('continueSubscription:success', {page: 'accountHome', member});
    } catch (e) {
        return buildErrorResult({
            action: 'continueSubscription',
            state,
            message: t('Failed to cancel subscription, please try again')
        });
    }
}

async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({offerId, subscriptionId});
        const member = await api.member.sessionData();
        return buildSuccessResult({
            action: 'applyOffer',
            state,
            message: 'Offer applied successfully!',
            extras: {page: 'accountHome', member, offers: []}
        });
    } catch (e) {
        return buildErrorResult({
            action: 'applyOffer',
            state,
            message: 'Failed to apply offer, please try again'
        });
    }
}

// ─── Billing Actions ──────────────────────────────────────────────────────────

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return buildErrorResult({
            action: 'editBilling',
            state,
            message: t('Failed to update billing information, please try again')
        });
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return buildErrorResult({
            action: 'manageBilling',
            state,
            message: t('Failed to open billing portal, please try again')
        });
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
        return buildActionResult('updateNewsletterPref:success', {member});
    } catch (e) {
        return {
            action: 'updateNewsletterPref:failed',
            popupNotification: createPopupNotification({
                type: 'updateNewsletter:failed', autoHide: true, closeable: true, state, status: 'error',
                message: t('Failed to update newsletter settings')
            })
        };
    }
}

async function updateNewsletter({data, state, api}) {
    try {
        const member = await api.member.update({subscribed: data.subscribed});
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        return buildSuccessResult({
            action: 'updateNewsletter',
            state,
            message: t('Email newsletter settings updated'),
            extras: {member}
        });
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: createPopupNotification({
                type: 'updateNewsletter:failed', autoHide: true, closeable: true, state, status: 'error',
                message: t('Failed to update newsletter settings')
            })
        };
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        return buildSuccessResult({
            action: 'removeEmailFromSuppressionList',
            state,
            message: t('You have been successfully resubscribed')
        });
    } catch (e) {
        return {
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createPopupNotification({
                type: 'removeEmailFromSuppressionList:failed', autoHide: true, closeable: true, state, status: 'error',
                message: t('Your email has failed to resubscribe, please try again')
            })
        };
    }
}

// ─── Profile Update Actions ───────────────────────────────────────────────────

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
            ? buildActionResult('refreshMemberData:success', {member, success: true})
            : null;
    } catch (error) {
        return buildActionResult('refreshMemberData:failed', {success: false, error});
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
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    const memberExtras = (update