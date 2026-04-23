import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

/* Simple state transition actions */
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

/* Authentication actions */
async function signout({api, state}) {
    try {
        await api.member.signout();
        return {action: 'signout:success'};
    } catch (e) {
        return {
            action: 'signout:failed',
            popupNotification: createPopupNotification({
                type: 'signout:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: t('Failed to log out, please try again')
            })
        };
    }
}
async function signin({data, api, state}) {
    try {
        const integrityToken = await api.member.getIntegrityToken();
        const payload = {...data, emailType: 'signin', integrityToken, includeOTC: true};
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
        return {
            action: 'signin:failed',
            popupNotification: createPopupNotification({
                type: 'signin:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: chooseBestErrorMessage(e, t('Failed to log in, please try again'))
            })
        };
    }
}

/* Helper for free‑plan signup */
async function _signupFreePlan({data, api}) {
    const integrityToken = await api.member.getIntegrityToken();
    const {inboxLinks} = await api.member.sendMagicLink({
        emailType: 'signup',
        integrityToken,
        ...data,
        name: data.name?.trim()
    });
    return inboxLinks;
}

/* Helper for paid‑plan signup */
async function _signupPaidPlan({data, state, api}) {
    let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
    name = name?.trim();

    if (tierId && cadence) {
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
    } else {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
    }
    return {page: 'loading'};
}

/* Signup action with extracted branches */
async function signup({data, state, api}) {
    try {
        const planLower = (data.plan || '').toLowerCase();
        if (planLower === 'free') {
            const inboxLinks = await _signupFreePlan({data, api});
            return {
                page: 'magiclink',
                lastPage: 'signup',
                inboxLinks,
                pageData: {
                    ...(state.pageData || {}),
                    email: (data.email || '').trim()
                }
            };
        }
        return await _signupPaidPlan({data, state, api});
    } catch (e) {
        return {
            action: 'signup:failed',
            popupNotification: createPopupNotification({
                type: 'signup:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
            })
        };
    }
}

/* Verification of one‑time code */
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

/* Checkout helper */
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
            metadata: {checkoutType: 'upgrade'}
        });
    } catch (e) {
        return {
            action: 'checkoutPlan:failed',
            popupNotification: createPopupNotification({
                type: 'checkoutPlan:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: t('Failed to process checkout, please try again')
            })
        };
    }
}

/* Subscription management actions */
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
            planId
        });
        const member = await api.member.sessionData();
        const action = 'updateSubscription:success';
        return {
            action,
            popupNotification: createPopupNotification({
                type: action,
                autoHide: true,
                closeable: true,
                state,
                status: 'success',
                message: t('Subscription plan updated successfully')
            }),
            page: 'accountHome',
            member
        };
    } catch (e) {
        return {
            action: 'updateSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'updateSubscription:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: t('Failed to update subscription, please try again')
            })
        };
    }
}
async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        const member = await api.member.sessionData();
        return {action: 'cancelSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return {
            action: 'cancelSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'cancelSubscription:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: t('Failed to cancel subscription, please try again')
            })
        };
    }
}
async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        const member = await api.member.sessionData();
        return {action: 'continueSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return {
            action: 'continueSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'continueSubscription:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: t('Failed to cancel subscription, please try again')
            })
        };
    }
}

/* Offer handling */
async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({offerId, subscriptionId});
        const member = await api.member.sessionData();
        return {
            action: 'applyOffer:success',
            page: 'accountHome',
            member,
            offers: [],
            popupNotification: createPopupNotification({
                type: 'applyOffer:success',
                autoHide: true,
                closeable: true,
                state,
                status: 'success',
                message: 'Offer applied successfully!'
            })
        };
    } catch (e) {
        return {
            action: 'applyOffer:failed',
            popupNotification: createPopupNotification({
                type: 'applyOffer:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: 'Failed to apply offer, please try again'
            })
        };
    }
}

/* Billing actions */
async function editBilling({data, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return {
            action: 'editBilling:failed',
            popupNotification: createPopupNotification({
                type: 'editBilling:failed',
                autoHide: false,
                closeable: true,
                state: undefined,
                status: 'error',
                message: t('Failed to update billing information, please try again')
            })
        };
    }
}
async function manageBilling({data, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return {
            action: 'manageBilling:failed',
            popupNotification: createPopupNotification({
                type: 'manageBilling:failed',
                autoHide: false,
                closeable: true,
                state: undefined,
                status: 'error',
                message: t('Failed to open billing portal, please try again')
            })
        };
    }
}

/* Notification helpers */
async function clearPopupNotification() {
    return {popupNotification: null};
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

/* Newsletter preferences */
async function updateNewsletterPreference({data, state, api}) {
    try {
        const {newsletters, enableCommentNotifications} = data;
        if (!newsletters && enableCommentNotifications === undefined) {
            return {};
        }
        const updateData = {};
        if (newsletters) updateData.newsletters = newsletters;
        if (enableCommentNotifications !== undefined) updateData.enableCommentNotifications = enableCommentNotifications;
        const member = await api.member.update(updateData);
        return {action: 'updateNewsletterPref:success', member};
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
async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        return {
            action: 'removeEmailFromSuppressionList:success',
            popupNotification: createPopupNotification({
                type: 'removeEmailFromSuppressionList:success',
                autoHide: true,
                closeable: true,
                state,
                status: 'success',
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
async function updateNewsletter({data, state, api}) {
    try {
        const {subscribed} = data;
        const member = await api.member.update({subscribed});
        if (!member) throw new Error('Failed to update newsletter');
        return {
            action: 'updateNewsletter:success',
            member,
            popupNotification: createPopupNotification({
                type: 'updateNewsletter:success',
                autoHide: true,
                closeable: true,
                state,
                status: 'success',
                message: t('Email newsletter settings updated')
            })
        };
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
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

/* Member data helpers */
async function updateMemberEmail({data, state, api}) {
    const {email} = data;
    const originalEmail = getMemberEmail({member: state.member});
    if (email !== originalEmail) {
        try {
            await api.member.updateEmailAddress({email});
            return {success: true};
        } catch (err) {
            return {success: false, error: err};
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
            if (!member) throw new Error('Failed to update member');
            return {member, success: true};
        } catch (err) {
            return {success: false, error: err};
        }
    }
    return null;
}
async function refreshMemberData({state, api}) {
    if (!state.member) return null;
    try {
        const member = await api.member.sessionData();
        if (member) {
            return {member, success: true, action: 'refreshMemberData:success'};
        }
        return null;
    } catch (err) {
        return {success: false, error: err, action: 'refreshMemberData:failed'};
    }
}

/* Build result for profile update */
function _buildProfileResult({dataUpdate, emailUpdate, state}) {
    // Both updates succeeded
    if (dataUpdate && emailUpdate && emailUpdate.success) {
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
    // One or both failed
    if (dataUpdate && emailUpdate) {
        const action = 'updateProfile:failed';
        const status = 'error';
        const message = !dataUpdate.success
            ? t('Failed to update account data')
            : t('Failed to send verification email');
        return {
            action,
            ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
            popupNotification: createPopupNotification({
                type: action,
                autoHide: true,
                closeable: true,
                status,
                message,
                state
            })
        };
    }
    // Only data update present
    if (dataUpdate) {
        const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
        const status = dataUpdate.success ? 'success' : 'error';
        const message = dataUpdate.success
            ? t('Account details updated successfully')
            : t('Failed to update account details');
        return {
            action,
            ...(dataUpdate.success ? {member: dataUpdate.member, page: 'accountHome'} : {}),
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
    // Only email update present
    if (emailUpdate) {
        const action = emailUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
        const status = emailUpdate.success ? 'success' : 'error';
        const message = emailUpdate.error
            ? chooseBestErrorMessage(emailUpdate.error, t('Failed to send verification email'))
            : t('Check your inbox to verify email update');
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
    // No changes
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

/* Profile update orchestrator */
async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);
    return _buildProfileResult({dataUpdate, emailUpdate, state});
}

/* One‑click subscription */
async function oneClickSubscribe({data: {siteUrl}, state}) {
    const externalSiteApi = setupGhostApi({siteUrl, apiUrl: 'not-defined', contentApiKey: 'not-defined'});
    const {member} = state;
    const referrerUrl = window.location.href;
    const referrerSource = getRefDomain();
    const integrityToken = await externalSiteApi.member.getIntegrityToken();
    await externalSiteApi.member.sendMagicLink({
        emailType: 'signup',
        name: member.name,
        email: member.email,
        autoRedirect: false,
        integrityToken,
        customUrlHistory: state.site.outbound_link_tagging
            ? [{
                time: Date.now(),
                referrerSource,
                referrerMedium: 'Ghost Recommendations',
                referrerUrl
            }]
            : []
    });
    return {};
}

/* Recommendation tracking */
function trackRecommendationClicked({data: {recommendationId}, api}) {
    try {
        const existing = localStorage.getItem('ghost-recommendations-clicked');
        const clicked = existing ? JSON.parse(existing) : [];
        if (!clicked.includes(recommendationId)) {
            clicked.push(recommendationId);
            localStorage.setItem('ghost-recommendations-clicked', JSON.stringify(clicked));
        }
    } catch (e) {
        // ignore storage errors
    }
    api.recommendations.trackClicked({recommendationId});
    return {};
}
async function trackRecommendationSubscribed({data: {recommendationId}, api}) {
    api.recommendations.trackSubscribed({recommendationId});
    return {};
}

/* Action registry */
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
        return (await handler({data, state, api})) || {};
    }
    return {};
}