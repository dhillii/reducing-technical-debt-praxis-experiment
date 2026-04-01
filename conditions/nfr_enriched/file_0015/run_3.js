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
async function prepareSigninPayload({data, api}) {
    const integrityToken = await api.member.getIntegrityToken();
    return {
        ...data,
        emailType: 'signin',
        integrityToken,
        includeOTC: true
    };
}

// Helper: Build signin success response
function buildSigninSuccessResponse({otcRef, inboxLinks, email, state}) {
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
        const payload = await prepareSigninPayload({data, api});
        const {otc_ref: otcRef, inboxLinks} = await api.member.sendMagicLink(payload);
        return buildSigninSuccessResponse({otcRef, inboxLinks, email: data?.email, state});
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
async function handleFreeSignup({data, api}) {
    const integrityToken = await api.member.getIntegrityToken();
    const {inboxLinks} = await api.member.sendMagicLink({
        emailType: 'signup',
        integrityToken,
        ...data,
        name: data.name?.trim()
    });
    return {inboxLinks, isFree: true};
}

// Helper: Handle paid plan signup
async function handlePaidSignup({data, state, api}) {
    let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
    
    if (!tierId || !cadence) {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
    }
    
    await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
    return {isFree: false};
}

// Helper: Build signup success response
function buildSignupSuccessResponse({inboxLinks, email, state, isFree}) {
    if (!isFree) {
        return {page: 'loading'};
    }
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

async function signup({data, state, api}) {
    try {
        const plan = data.plan.toLowerCase();
        const result = plan === 'free'
            ? await handleFreeSignup({data, api})
            : await handlePaidSignup({data, state, api});
        
        return buildSignupSuccessResponse({...result, email: data.email, state});
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

// Helper: Resolve tier and cadence for checkout
function resolveTierAndCadence({plan, tierId, cadence, state}) {
    if (tierId && cadence) {
        return {tierId, cadence};
    }
    return getProductCadenceFromPrice({site: state?.site, priceId: plan});
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = resolveTierAndCadence({
            plan,
            tierId: data.tierId,
            cadence: data.cadence,
            state
        });

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

// Helper: Create subscription success notification
function createSubscriptionSuccessNotification({action, state, message}) {
    return createPopupNotification({
        type: action,
        autoHide: true,
        closeable: true,
        state,
        status: 'success',
        message
    });
}

// Helper: Create subscription error notification
function createSubscriptionErrorNotification({action, state, message}) {
    return createPopupNotification({
        type: action,
        autoHide: false,
        closeable: true,
        state,
        status: 'error',
        message
    });
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

        return {
            action,
            popupNotification: createSubscriptionSuccessNotification({
                action,
                state,
                message: t('Subscription plan updated successfully')
            }),
            page: 'accountHome',
            member: member
        };
    } catch (e) {
        return {
            action: 'updateSubscription:failed',
            popupNotification: createSubscriptionErrorNotification({
                action: 'updateSubscription:failed',
                state,
                message: t('Failed to update subscription, please try again')
            })
        };
    }
}

async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({
            subscriptionId,
            smartCancel: true,
            cancellationReason
        });

        const member = await api.member.sessionData();
        const action = 'cancelSubscription:success';

        return {
            action,
            page: 'accountHome',
            member: member
        };
    } catch (e) {
        return {
            action: 'cancelSubscription:failed',
            popupNotification: createSubscriptionErrorNotification({
                action: 'cancelSubscription:failed',
                state,
                message: t('Failed to cancel subscription, please try again')
            })
        };
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({
            subscriptionId,
            cancelAtPeriodEnd: false
        });

        const member = await api.member.sessionData();
        const action = 'continueSubscription:success';

        return {
            action,
            page: 'accountHome',
            member: member
        };
    } catch (e) {
        return {
            action: 'continueSubscription:failed',
            popupNotification: createSubscriptionErrorNotification({
                action: 'continueSubscription:failed',
                state,
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
            popupNotification: createSubscriptionSuccessNotification({
                action,
                state,
                message: 'Offer applied successfully!'
            })
        };
    } catch (e) {
        return {
            action: 'applyOffer:failed',
            popupNotification: createSubscriptionErrorNotification({
                action: 'applyOffer:failed',
                state,
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

// Helper: Build newsletter update data
function buildNewsletterUpdateData({newsletters, enableCommentNotifications}) {
    const updateData = {};
    if (newsletters) {
        updateData.newsletters = newsletters;
    }
    if (enableCommentNotifications !== undefined) {
        updateData.enableCommentNotifications = enableCommentNotifications;
    }
    return updateData;
}

async function updateNewsletterPreference({data, state, api}) {
    try {
        const {newsletters, enableCommentNotifications} = data;
        
        if (!newsletters && enableCommentNotifications === undefined) {
            return {};
        }

        const updateData = buildNewsletterUpdateData({newsletters, enableCommentNotifications});
        const member = await api.member.update(updateData);
        const action = 'updateNewsletterPref:success';

        return {
            action,
            member
        };
    } catch (e) {
        return {
            action: 'updateNewsletterPref:failed',
            popupNotification: createPopupNotification({
                type: 'updateNewsletter:failed',
                autoHide: true,
                closeable: true,
                state,
                status: 'error',
                message: t('Failed to update newsletter settings')
            })
        };
    }
}

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

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        const action = 'removeEmailFromSuppressionList:success';

        return {
            action,
            popupNotification: createPopupNotification({
                type: action, autoHide: true, closeable: true, state, status: 'success',
                message: t('You have been successfully resubscribed')
            })
        };
    } catch (e) {
        return {
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createPopupNotification({
                type: 'removeEmailFromSuppressionList:failed',
                autoHide: true,
                closeable: true,
                state,
                status: 'error',
                message: t('Your email has failed to resubscribe, please try again')
            })
        };
    }
}

// ============================================================================
// MEMBER PROFILE ACTIONS
// ============================================================================

// Helper: Check if email needs updating
function shouldUpdateEmail({email, member}) {
    return email !== getMemberEmail({member});
}

// Helper: Check if name needs updating
function shouldUpdateName({name, member}) {
    return getMemberName({member}) !== name;
}

async function updateMemberEmail({data, state, api}) {
    const {email} = data;

    if (!shouldUpdateEmail({email, member: state.member})) {
        return null;
    }

    try {
        await api.member.updateEmailAddress({email});
        return {
            success: true
        };
    } catch (err) {
        return {
            success: false,
            error: err
        };
    }
}

async function updateMemberData({data, state, api}) {
    const name = data?.name?.trim();

    if (!shouldUpdateName({name, member: state.member})) {
        return null;
    }

    try {
        const member = await api.member.update({name});
        if (!member) {
            throw new Error('Failed to update member');
        }
        return {
            member,
            success: true
        };
    } catch (err) {
        return {
            success: false,
            error: err
        };
    }
}

async function refreshMemberData({state, api}) {
    if (!state.member) {
        return null;
    }

    try {
        const member = await api.member.sessionData();
        if (member) {
            return {
                member,
                success: true,
                action: 'refreshMemberData:success'
            };
        }
        return null;
    } catch (err) {
        return {
            success: false,
            error: err,
            action: 'refreshMemberData:failed'
        };
    }
}

// Helper: Build profile update response for both updates
function buildProfileUpdateResponse({dataUpdate, emailUpdate, state}) {
    if (dataUpdate && emailUpdate) {
        return buildProfileResponseBothUpdates({dataUpdate, emailUpdate, state});
    }
    if (dataUpdate) {
        return buildProfileResponseDataOnly({dataUpdate, state});
    }
    if (emailUpdate) {
        return buildProfileResponseEmailOnly({emailUpdate, state});
    }
    return buildProfileResponseNoUpdates({state});
}

// Helper: Handle both data and email updates
function buildProfileResponseBothUpdates({dataUpdate, emailUpdate, state}) {
    if (emailUpdate.success) {
        return {
            action: 'updateProfile:success',
            ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
            page: 'accountHome',
            popupNotification: createPopupNotification({
                type: 'updateProfile:success',
                autoHide: true,
                closeable: true,
                status: 'success',
                state,
                message: t('Check your inbox to verify email update')
            })
        };
    }

    const message = !dataUpdate.success
        ? t('Failed to update account data')
        : t('Failed to send verification email');

    return {
        action: 'updateProfile:failed',
        ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
        popupNotification: createPopupNotification({
            type: 'updateProfile:failed',
            autoHide: true,
            closeable: true,
            status: 'error',
            message,
            state
        })
    };
}

// Helper: Handle data update only
function buildProfileResponseDataOnly({dataUpdate, state}) {
    const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = dataUpdate.success ? 'success' : 'error';
    const message = !dataUpdate.success
        ? t('Failed to update account details')
        : t('Account details updated successfully');

    return {
        action,
        ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
        ...(dataUpdate.success ? {page: 'accountHome'} : {}),
        popupNotification: createPopupNotification({
            type: action,
            autoHide: dataUpdate.success,
            closeable: true,
            status,
            state,
            message
        })
    };
}

// Helper: Handle email update only
function buildProfileResponseEmailOnly({emailUpdate, state}) {
    const action = emailUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = emailUpdate.success ? 'success' : 'error';
    let message = '';

    if (emailUpdate.error) {
        message = chooseBestErrorMessage(emailUpdate.error, t('Failed to send verification email'));
    } else {
        message = t('Check your inbox to verify email update');
    }

    return {
        action,
        ...(emailUpdate.success ? {page: 'accountHome'} : {}),
        popupNotification: createPopupNotification({
            type: action,
            autoHide: emailUpdate.success,
            closeable: true,
            status,
            state,
            message
        })
    };
}

// Helper: Handle no updates needed
function buildProfileResponseNoUpdates({state}) {
    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success',
            autoHide: true,
            closeable: true,
            status: 'success',
            state,
            message: t('Account details updated successfully')
        })
    };
}

async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    return buildProfileUpdateResponse({dataUpdate, emailUpdate, state});
}

// ============================================================================
// RECOMMENDATION ACTIONS
// ============================================================================

// Helper: Build referrer metadata for recommendations
function buildReferrerMetadata({state}) {
    if (!state.site.outbound_link_tagging) {
        return [];
    }

    return [{
        time: Date.now(),
        referrerSource: getRefDomain(),
        referrerMedium: 'Ghost Recommendations',
        referrerUrl: window.location.href
    }];
}

async function oneClickSubscribe({data: {siteUrl}, state}) {
    const externalSiteApi = setupGhostApi({
        siteUrl: siteUrl,
        apiUrl: 'not-defined',
        contentApiKey: 'not-defined'
    });

    const {member} = state;
    const integrityToken = await externalSiteApi.member.getIntegrityToken();
    const customUrlHistory = buildReferrerMetadata({state});

    await externalSiteApi.member.sendMagicLink({
        emailType: 'signup',
        name: member.name,
        email: member.email,
        autoRedirect: false,
        integrityToken,
        customUrlHistory
    });

    return {};
}

// Helper: Track recommendation in local storage
function trackRecommendationInStorage({recommendationId}) {
    try {
        const existing = localStorage.getItem('ghost-recommendations-clicked');
        const clicked = existing ? JSON.parse(existing) : [];

        if (clicked.includes(recommendationId)) {
            return false;
        }

        clicked.push(recommendationId);
        localStorage.setItem('ghost-recommendations-clicked', JSON.stringify(clicked));
        return true;
    } catch (e) {
        // Ignore localstorage errors (browser not supported or in private mode)
        return false;
    }
}

function trackRecommendationClicked({data: {recommendationId}, api}) {
    const tracked = trackRecommendationInStorage({recommendationId});

    if (tracked) {
        api.recommendations.trackClicked({
            recommendationId
        });
    }

    return {};
}

async function trackRecommendationSubscribed({data: {recommendationId}, api}) {
    api.recommendations.trackSubscribed({
        recommendationId
    });

    return {};
}

// ============================================================================
// ACTION REGISTRY & HANDLER
// ============================================================================

const Actions = {
    togglePopup,
    openPopup,
    closePopup,
    switchPage,
    openNotification,
    closeNotification,
    back,
    signout,
    signin,
    startSigninOTCFromCustomForm,
    verifyOTC,
    signup,
    updateSubscription,
    cancelSubscription,
    continueSubscription,
    applyOffer,
    updateNewsletter,
    updateProfile,
    refreshMemberData,
    clearPopupNotification,
    editBilling,
    manageBilling,
    checkoutPlan,
    updateNewsletterPreference,
    showPopupNotification,
    removeEmailFromSuppressionList,
    oneClickSubscribe,
    trackRecommendationClicked,
    trackRecommendationSubscribed
};

/** Handle actions in the App, returns updated state */
export default async function ActionHandler({action, data, state, api}) {
    const handler = Actions[action];
    if (handler) {
        return await handler({data, state, api}) || {};
    }
    return {};
}
```