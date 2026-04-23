import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

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
    } else {
        return closePopup({state});
    }
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

// Helper: Create error notification for failed actions
function createErrorNotification(actionType, message, state) {
    return {
        action: actionType,
        popupNotification: createPopupNotification({
            type: actionType,
            autoHide: false,
            closeable: true,
            state,
            status: 'error',
            message
        })
    };
}

// Helper: Create success notification for successful actions
function createSuccessNotification(actionType, message, state, additionalData = {}) {
    return {
        action: actionType,
        popupNotification: createPopupNotification({
            type: actionType,
            autoHide: true,
            closeable: true,
            state,
            status: 'success',
            message
        }),
        ...additionalData
    };
}

async function signout({api, state}) {
    try {
        await api.member.signout();
        return {
            action: 'signout:success'
        };
    } catch (e) {
        return createErrorNotification('signout:failed', t('Failed to log out, please try again'), state);
    }
}

// Helper: Get integrity token and prepare signin payload
async function prepareSigninPayload(data, api) {
    const integrityToken = await api.member.getIntegrityToken();
    return {
        ...data,
        emailType: 'signin',
        integrityToken,
        includeOTC: true
    };
}

// Helper: Build signin response with magic link data
function buildSigninResponse(otcRef, inboxLinks, email, state) {
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
        return buildSigninResponse(otcRef, inboxLinks, data?.email, state);
    } catch (e) {
        return createErrorNotification('signin:failed', chooseBestErrorMessage(e, t('Failed to log in, please try again')), state);
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
        } else {
            return {
                action: 'verifyOTC:failed',
                actionErrorMessage: chooseBestErrorMessage(response.errors?.[0], genericErrorMessage)
            };
        }
    } catch (e) {
        return {
            action: 'verifyOTC:failed',
            actionErrorMessage: chooseBestErrorMessage(e, genericErrorMessage)
        };
    }
}

// Helper: Handle free plan signup flow
async function handleFreePlanSignup(data, api) {
    const integrityToken = await api.member.getIntegrityToken();
    const {inboxLinks} = await api.member.sendMagicLink({
        emailType: 'signup',
        integrityToken,
        ...data,
        name: data.name?.trim()
    });
    return {inboxLinks};
}

// Helper: Handle paid plan signup flow
async function handlePaidPlanSignup(data, state, api) {
    let {tierId, cadence} = data;
    if (!tierId || !cadence) {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: data.plan}));
    }
    const {plan, email, name, newsletters, offerId} = data;
    await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
    return {page: 'loading'};
}

// Helper: Build signup response for magic link
function buildSignupResponse(inboxLinks, email, state) {
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
        const {plan} = data;
        let result;

        if (plan.toLowerCase() === 'free') {
            result = await handleFreePlanSignup(data, api);
            return buildSignupResponse(result.inboxLinks, data.email, state);
        } else {
            await handlePaidPlanSignup(data, state, api);
            return {page: 'loading'};
        }
    } catch (e) {
        const message = chooseBestErrorMessage(e, t('Failed to sign up, please try again'));
        return createErrorNotification('signup:failed', message, state);
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        let {plan, offerId, tierId, cadence} = data;
        if (!tierId || !cadence) {
            ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
        }
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
        return createErrorNotification('checkoutPlan:failed', t('Failed to process checkout, please try again'), state);
    }
}

// Helper: Update subscription and fetch member data
async function performSubscriptionUpdate(updatePayload, api) {
    await api.member.updateSubscription(updatePayload);
    return await api.member.sessionData();
}

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

        const member = await performSubscriptionUpdate({
            planName: plan,
            tierId,
            cadence,
            subscriptionId,
            cancelAtPeriodEnd,
            planId: planId
        }, api);

        const action = 'updateSubscription:success';
        return createSuccessNotification(action, t('Subscription plan updated successfully'), state, {
            page: 'accountHome',
            member
        });
    } catch (e) {
        return createErrorNotification('updateSubscription:failed', t('Failed to update subscription, please try again'), state);
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
        return {
            action: 'cancelSubscription:success',
            page: 'accountHome',
            member
        };
    } catch (e) {
        return createErrorNotification('cancelSubscription:failed', t('Failed to cancel subscription, please try again'), state);
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
        return {
            action: 'continueSubscription:success',
            page: 'accountHome',
            member
        };
    } catch (e) {
        return createErrorNotification('continueSubscription:failed', t('Failed to cancel subscription, please try again'), state);
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
            popupNotification: createPopupNotification({
                type: action,
                autoHide: true,
                closeable: true,
                state,
                status: 'success',
                message: 'Offer applied successfully!'
            })
        };
    } catch (e) {
        return createErrorNotification('applyOffer:failed', 'Failed to apply offer, please try again', state);
    }
}

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return createErrorNotification('editBilling:failed', t('Failed to update billing information, please try again'), state);
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return createErrorNotification('manageBilling:failed', t('Failed to open billing portal, please try again'), state);
    }
}

async function clearPopupNotification() {
    return {
        popupNotification: null
    };
}

async function showPopupNotification({data, state}) {
    let {action, message = ''} = data;
    action = action || 'showPopupNotification:success';
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

// Helper: Build update data for newsletter preferences
function buildNewsletterUpdateData(newsletters, enableCommentNotifications) {
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
        const updateData = buildNewsletterUpdateData(newsletters, enableCommentNotifications);
        const member = await api.member.update(updateData);
        return {
            action: 'updateNewsletterPref:success',
            member
        };
    } catch (e) {
        return createErrorNotification('updateNewsletter:failed', t('Failed to update newsletter settings'), state);
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        const action = 'removeEmailFromSuppressionList:success';
        return createSuccessNotification(action, t('You have been successfully resubscribed'), state);
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

async function updateNewsletter({data, state, api}) {
    try {
        const {subscribed} = data;
        const member = await api.member.update({subscribed});
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        const action = 'updateNewsletter:success';
        return createSuccessNotification(action, t('Email newsletter settings updated'), state, {member});
    } catch (e) {
        return createErrorNotification('updateNewsletter:failed', t('Failed to update newsletter settings'), state);
    }
}

async function updateMemberEmail({data, state, api}) {
    const {email} = data;
    const originalEmail = getMemberEmail({member: state.member});
    if (email !== originalEmail) {
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
    return null;
}

async function updateMemberData({data, state, api}) {
    const name = data?.name?.trim();
    const originalName = getMemberName({member: state.member});

    if (originalName !== name) {
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
    return null;
}

async function refreshMemberData({state, api}) {
    if (state.member) {
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
    return null;
}

// Helper: Handle profile update with both data and email changes
function buildProfileUpdateResponse(dataUpdate, emailUpdate, state) {
    if (dataUpdate && emailUpdate) {
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
        const message = !dataUpdate.success ? t('Failed to update account data') : t('Failed to send verification email');
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
    return null;
}

// Helper: Handle profile update with only data changes
function buildProfileDataOnlyResponse(dataUpdate, state) {
    const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = dataUpdate.success ? 'success' : 'error';
    const message = !dataUpdate.success ? t('Failed to update account details') : t('Account details updated successfully');
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

// Helper: Handle profile update with only email changes
function buildProfileEmailOnlyResponse(emailUpdate, state) {
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

async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    const combinedResponse = buildProfileUpdateResponse(dataUpdate, emailUpdate, state);
    if (combinedResponse) {
        return combinedResponse;
    }

    if (dataUpdate) {
        return buildProfileDataOnlyResponse(dataUpdate, state);
    }

    if (emailUpdate) {
        return buildProfileEmailOnlyResponse(emailUpdate, state);
    }

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

// Helper: Build magic link payload for one-click subscribe
function buildOneClickSubscribePayload(member, state, referrerUrl, referrerSource) {
    return {
        emailType: 'signup',
        name: member.name,
        email: member.email,
        autoRedirect: false,
        customUrlHistory: state.site.outbound_link_tagging ? [
            {
                time: Date.now(),
                referrerSource,
                referrerMedium: 'Ghost Recommendations',
                referrerUrl
            }
        ] : []
    };
}

async function oneClickSubscribe({data: {siteUrl}, state}) {
    const externalSiteApi = setupGhostApi({siteUrl: siteUrl, apiUrl: 'not-defined', contentApiKey: 'not-defined'});
    const {member} = state;

    const referrerUrl = window.location.href;
    const referrerSource = getRefDomain();

    const integrityToken = await externalSiteApi.member.getIntegrityToken();
    const payload = buildOneClickSubscribePayload(member, state, referrerUrl, referrerSource);

    await externalSiteApi.member.sendMagicLink({
        ...payload,
        integrityToken
    });

    return {};
}

// Helper: Track recommendation in local storage
function trackRecommendationInStorage(recommendationId) {
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
        return false;
    }
}

function trackRecommendationClicked({data: {recommendationId}, api}) {
    const isNewClick = trackRecommendationInStorage(recommendationId);
    if (isNewClick) {
        api.recommendations.trackClicked({recommendationId});
    }
    return {};
}

async function trackRecommendationSubscribed({data: {recommendationId}, api}) {
    api.recommendations.trackSubscribed({recommendationId});
    return {};
}

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