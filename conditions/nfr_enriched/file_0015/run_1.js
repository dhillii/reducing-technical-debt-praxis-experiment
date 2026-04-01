```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// ============================================================================
// PAGE NAVIGATION ACTIONS
// ============================================================================

function switchPage({data, state}) {
    return {
        page: data.page,
        popupNotification: null,
        lastPage: data.lastPage || null,
        pageData: data.pageData || state.pageData
    };
}

function togglePopup({state}) {
    return {
        showPopup: !state.showPopup
    };
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
    if (state.lastPage) {
        return {
            page: state.lastPage
        };
    }
    return closePopup({state});
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

// ============================================================================
// NOTIFICATION ACTIONS
// ============================================================================

function openNotification({data}) {
    return {
        showNotification: true,
        ...data
    };
}

function closeNotification() {
    return {
        showNotification: false
    };
}

async function clearPopupNotification() {
    return {
        popupNotification: null
    };
}

async function showPopupNotification({data, state}) {
    const {action = 'showPopupNotification:success', message = ''} = data;
    return {
        popupNotification: createPopupNotification({
            type: action,
            autoHide: true,
            closeable: true,
            state,
            status: 'success',
            message
        })
    };
}

// ============================================================================
// AUTHENTICATION ACTIONS
// ============================================================================

async function signout({api, state}) {
    try {
        await api.member.signout();
        return {
            action: 'signout:success'
        };
    } catch (e) {
        return {
            action: 'signout:failed',
            popupNotification: createPopupNotification({
                type: 'signout:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to log out, please try again')
            })
        };
    }
}

// Helper: Prepare signin payload with integrity token
async function prepareSigninPayload(data, api) {
    const integrityToken = await api.member.getIntegrityToken();
    return {
        ...data,
        emailType: 'signin',
        integrityToken,
        includeOTC: true
    };
}

// Helper: Build signin success response
function buildSigninSuccessResponse(otcRef, inboxLinks, email, state) {
    return {
        page: 'magiclink',
        lastPage: 'signin',
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
        const payload = await prepareSigninPayload(data, api);
        const {otc_ref: otcRef, inboxLinks} = await api.member.sendMagicLink(payload);
        return buildSigninSuccessResponse(otcRef, inboxLinks, data?.email, state);
    } catch (e) {
        return {
            action: 'signin:failed',
            popupNotification: createPopupNotification({
                type: 'signin:failed', autoHide: false, closeable: true, state, status: 'error',
                message: chooseBestErrorMessage(e, t('Failed to log in, please try again'))
            })
        };
    }
}

function startSigninOTCFromCustomForm({data, state}) {
    const email = (data?.email || '').trim();
    const otcRef = data?.otcRef;
    const inboxLinks = data?.inboxLinks;

    if (!otcRef) {
        return {};
    }

    return {
        showPopup: true,
        page: 'magiclink',
        lastPage: 'signin',
        otcRef,
        inboxLinks,
        pageData: {
            ...(state.pageData || {}),
            email
        },
        popupNotification: null
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

// ============================================================================
// SIGNUP & CHECKOUT ACTIONS
// ============================================================================

// Helper: Handle free plan signup
async function handleFreeSignup(data, api) {
    const integrityToken = await api.member.getIntegrityToken();
    const {inboxLinks} = await api.member.sendMagicLink({
        emailType: 'signup',
        integrityToken,
        ...data,
        name: data.name?.trim()
    });
    return {inboxLinks, isFree: true};
}

// Helper: Handle paid plan checkout
async function handlePaidCheckout(data, state, api) {
    let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
    
    if (!tierId || !cadence) {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
    }
    
    await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
    return {isCheckout: true};
}

// Helper: Build signup success response
function buildSignupSuccessResponse(result, email, state) {
    if (result.isCheckout) {
        return {page: 'loading'};
    }
    return {
        page: 'magiclink',
        lastPage: 'signup',
        inboxLinks: result.inboxLinks,
        pageData: {
            ...(state.pageData || {}),
            email: (email || '').trim()
        }
    };
}

async function signup({data, state, api}) {
    try {
        const {plan, email} = data;
        const result = plan.toLowerCase() === 'free'
            ? await handleFreeSignup(data, api)
            : await handlePaidCheckout(data, state, api);
        
        return buildSignupSuccessResponse(result, email, state);
    } catch (e) {
        const message = chooseBestErrorMessage(e, t('Failed to sign up, please try again'));
        return {
            action: 'signup:failed',
            popupNotification: createPopupNotification({
                type: 'signup:failed', autoHide: false, closeable: true, state, status: 'error',
                message: message
            })
        };
    }
}

// Helper: Resolve tier and cadence from plan
function resolveTierAndCadence(data, state) {
    let {tierId, cadence, plan} = data;
    if (!tierId || !cadence) {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
    }
    return {tierId, cadence};
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = resolveTierAndCadence(data, state);
        
        await api.member.checkoutPlan({
            plan,
            tierId,
            cadence,
            offerId,
            metadata: {
                checkoutType: 'upgrade'
            }
        });
    } catch (e) {
        return {
            action: 'checkoutPlan:failed',
            popupNotification: createPopupNotification({
                type: 'checkoutPlan:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to process checkout, please try again')
            })
        };
    }
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT ACTIONS
// ============================================================================

// Helper: Build subscription success response
function buildSubscriptionSuccessResponse(action, member, state, message) {
    return {
        action,
        popupNotification: createPopupNotification({
            type: action, autoHide: true, closeable: true, state, status: 'success', message
        }),
        page: 'accountHome',
        member: member
    };
}

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

        await api.member.updateSubscription({
            planName: plan,
            tierId,
            cadence,
            subscriptionId,
            cancelAtPeriodEnd,
            planId: planId
        });
        const member = await api.member.sessionData();
        const action = 'updateSubscription:success';
        return buildSubscriptionSuccessResponse(action, member, state, t('Subscription plan updated successfully'));
    } catch (e) {
        return {
            action: 'updateSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'updateSubscription:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to update subscription, please try again')
            })
        };
    }
}

async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({
            subscriptionId, smartCancel: true, cancellationReason
        });
        const member = await api.member.sessionData();
        return {
            action: 'cancelSubscription:success',
            page: 'accountHome',
            member: member
        };
    } catch (e) {
        return {
            action: 'cancelSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'cancelSubscription:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to cancel subscription, please try again')
            })
        };
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({
            subscriptionId, cancelAtPeriodEnd: false
        });
        const member = await api.member.sessionData();
        return {
            action: 'continueSubscription:success',
            page: 'accountHome',
            member: member
        };
    } catch (e) {
        return {
            action: 'continueSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'continueSubscription:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to cancel subscription, please try again')
            })
        };
    }
}

async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({
            offerId,
            subscriptionId
        });
        const member = await api.member.sessionData();
        const action = 'applyOffer:success';
        return {
            action,
            page: 'accountHome',
            member: member,
            offers: [],
            popupNotification: createPopupNotification({
                type: 'applyOffer:success', autoHide: true, closeable: true, state, status: 'success',
                message: 'Offer applied successfully!'
            })
        };
    } catch (e) {
        return {
            action: 'applyOffer:failed',
            popupNotification: createPopupNotification({
                type: 'applyOffer:failed', autoHide: false, closeable: true, state, status: 'error',
                message: 'Failed to apply offer, please try again'
            })
        };
    }
}

// ============================================================================
// BILLING ACTIONS
// ============================================================================

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return {
            action: 'editBilling:failed',
            popupNotification: createPopupNotification({
                type: 'editBilling:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to update billing information, please try again')
            })
        };
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return {
            action: 'manageBilling:failed',
            popupNotification: createPopupNotification({
                type: 'manageBilling:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to open billing portal, please try again')
            })
        };
    }
}

// ============================================================================
// NEWSLETTER & PREFERENCES ACTIONS
// ============================================================================

async function updateNewsletter({data, state, api}) {
    try {
        const {subscribed} = data;
        const member = await api.member.update({subscribed});
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        const action = 'updateNewsletter:success';
        return {
            action,
            member: member,
            popupNotification: createPopupNotification({
                type: action, autoHide: true, closeable: true, state, status: 'success',
                message: t('Email newsletter settings updated')
            })
        };
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

async function updateNewsletterPreference({data, state, api}) {
    try {
        const {newsletters, enableCommentNotifications} = data;
        if (!newsletters && enableCommentNotifications === undefined) {
            return {};
        }
        const updateData = {};
        if (newsletters) {
            updateData.newsletters = newsletters;
        }
        if (enableCommentNotifications !== undefined) {
            updateData.enableCommentNotifications = enableCommentNotifications;
        }
        const member = await api.member.update(updateData);
        const action = 'updateNewsletterPref:success';