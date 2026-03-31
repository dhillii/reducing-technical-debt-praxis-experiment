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

function successActionWithMember({action, member, state, message, page = 'accountHome'}) {
    return {
        action,
        page,
        member,
        popupNotification: createSuccessNotification({action, state, message})
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

function buildMagicLinkPageState({lastPage, inboxLinks, otcRef, email, pageData}) {
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

// ─── Auth Actions ────────────────────────────────────────────────────────────

async function signout({api, state}) {
    try {
        await api.member.signout();
        return {action: 'signout:success'};
    } catch (e) {
        return failedAction('signout:failed', state, t('Failed to log out, please try again'));
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
        return buildMagicLinkPageState({
            lastPage: 'signin',
            inboxLinks,
            otcRef,
            email: data?.email,
            pageData: state.pageData
        });
    } catch (e) {
        return failedAction(
            'signin:failed',
            state,
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
        popupNotification: null,
        ...buildMagicLinkPageState({
            lastPage: 'signin',
            inboxLinks: data?.inboxLinks,
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
            const {inboxLinks} = await api.member.sendMagicLink({
                emailType: 'signup', integrityToken, ...data, name
            });
            return buildMagicLinkPageState({
                lastPage: 'signup',
                inboxLinks,
                email,
                pageData: state.pageData
            });
        }

        await resolveCheckoutParams({data: {...data, name}, state, api});
        return {page: 'loading'};
    } catch (e) {
        return failedAction(
            'signup:failed',
            state,
            chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
        );
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        let {plan, offerId, tierId, cadence} = data;
        if (!tierId || !cadence) {
            ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
        }
        await api.member.checkoutPlan({
            plan, tierId, cadence, offerId,
            metadata: {checkoutType: 'upgrade'}
        });
    } catch (e) {
        return failedAction(
            'checkoutPlan:failed',
            state,
            t('Failed to process checkout, please try again')
        );
    }
}

// ─── Subscription Management ─────────────────────────────────────────────────

async function withMemberRefresh({api, state, actionName, successMessage, apiCall}) {
    try {
        await apiCall();
        const member = await api.member.sessionData();
        return successMessage
            ? successActionWithMember({action: actionName, member, state, message: successMessage})
            : {action: actionName, page: 'accountHome', member};
    } catch (e) {
        return failedAction(`${actionName.split(':')[0]}:failed`, state, e._defaultMessage || '');
    }
}

async function updateSubscription({data, state, api}) {
    const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
    const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});
    try {
        await api.member.updateSubscription({
            planName: plan, tierId, cadence, subscriptionId, cancelAtPeriodEnd, planId
        });
        const member = await api.member.sessionData();
        return successActionWithMember({
            action: 'updateSubscription:success',
            member,
            state,
            message: t('Subscription plan updated successfully')
        });
    } catch (e) {
        return failedAction(
            'updateSubscription:failed',
            state,
            t('Failed to update subscription, please try again')
        );
    }
}

async function cancelSubscription({data, state, api}) {
    const {subscriptionId, cancellationReason} = data;
    try {
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        const member = await api.member.sessionData();
        return {action: 'cancelSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return failedAction(
            'cancelSubscription:failed',
            state,
            t('Failed to cancel subscription, please try again')
        );
    }
}

async function continueSubscription({data, state, api}) {
    const {subscriptionId} = data;
    try {
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        const member = await api.member.sessionData();
        return {action: 'continueSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return failedAction(
            'continueSubscription:failed',
            state,
            t('Failed to cancel subscription, please try again')
        );
    }
}

async function applyOffer({data, state, api}) {
    const {offerId, subscriptionId} = data;
    try {
        await api.member.applyOffer({offerId, subscriptionId});
        const member = await api.member.sessionData();
        return {
            action: 'applyOffer:success',
            page: 'accountHome',
            member,
            offers: [],
            popupNotification: createSuccessNotification({
                action: 'applyOffer:success',
                state,
                message: 'Offer applied successfully!'
            })
        };
    } catch (e) {
        return failedAction('applyOffer:failed', state, 'Failed to apply offer, please try again');
    }
}

// ─── Billing ─────────────────────────────────────────────────────────────────

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return failedAction(
            'editBilling:failed',
            state,
            t('Failed to update billing information, please try again')
        );
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return failedAction(
            'manageBilling:failed',
            state,
            t('Failed to open billing portal, please try again')
        );
    }
}

// ─── Notifications ───────────────────────────────────────────────────────────

async function clearPopupNotification() {
    return {popupNotification: null};
}

async function showPopupNotification({data, state}) {
    const action = data.action || 'showPopupNotification:success';
    return {
        popupNotification: createSuccessNotification({
            action, state, message: data.message || ''
        })
    };
}

// ─── Newsletter / Email ──────────────────────────────────────────────────────

async function updateNewsletterPreference({data, state, api}) {
    const {newsletters, enableCommentNotifications} = data;
    if (!newsletters && enableCommentNotifications === undefined) {
        return {};
    }

    const updateData = {
        ...(newsletters ? {newsletters} : {}),
        ...(enableCommentNotifications !== undefined ? {enableCommentNotifications} : {})
    };

    try {
        const member = await api.member.update(updateData);
        return {action: 'updateNewsletterPref:success', member};
    } catch (e) {
        return failedAction(
            'updateNewsletter:failed',
            state,
            t('Failed to update newsletter settings'),
            true
        );
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        return {
            action: 'removeEmailFromSuppressionList:success',
            popupNotification: createSuccessNotification({
                action: 'removeEmailFromSuppressionList:success',
                state,
                message: t('You have been successfully resubscribed')
            })
        };
    } catch (e) {
        return {
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createErrorNotification({
                action: 'removeEmailFromSuppressionList:failed',
                state,
                message: t('Your email has failed to resubscribe, please try again'),
                autoHide: true
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
        return {
            action: 'updateNewsletter:success',
            member,
            popupNotification: createSuccessNotification({
                action: 'updateNewsletter:success',
                state,
                message: t('Email newsletter settings updated')
            })
        };
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: createErrorNotification({
                action: 'updateNewsletter:failed',
                state,
                message: t('Failed to update newsletter settings'),
                autoHide: true
            })
        };
    }
}

// ─── Profile Update ──────────────────────────────────────────────────────────

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
            ? {member, success: true,