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

function signout({api, state}) {
    return signoutAction(api.member.signout())
        .then(() => ({action: 'signout:success'}))
        .catch(e => ({
            action: 'signout:failed',
            popupNotification: createPopupNotification({
                type: 'signout:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to log out, please try again')
            })
        }));
}

function signoutAction(apiCall) {
    return apiCall();
}

function signin({data, api, state}) {
    return signinAction(api.member)
        .then(({otc_ref: otcRef, inboxLinks}) => ({
            page: 'magiclink',
            lastPage: 'signin',
            ...(otcRef ? {otcRef} : {}),
            inboxLinks,
            pageData: {
                ...(state.pageData || {}),
                email: (data?.email || '').trim()
            }
        }))
        .catch(e => ({
            action: 'signin:failed',
            popupNotification: createPopupNotification({
                type: 'signin:failed', autoHide: false, closeable: true, state, status: 'error',
                message: chooseBestErrorMessage(e, t('Failed to log in, please try again'))
            })
        }));
}

function signinAction(memberApi) {
    return memberApi.getIntegrityToken().then(integrityToken => {
        const payload = {
            ...{},
            emailType: 'signin',
            integrityToken,
            includeOTC: true
        };
        return memberApi.sendMagicLink(payload);
    });
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

function verifyOTC({data, api}) {
    const genericErrorMessage = t('Failed to verify code, please try again');

    return verifyOTCAction(api.member, data)
        .then(response => {
            if (response.redirectUrl) {
                return window.location.assign(response.redirectUrl);
            }
            return {
                action: 'verifyOTC:failed',
                actionErrorMessage: chooseBestErrorMessage(response.errors?.[0], genericErrorMessage)
            };
        })
        .catch(e => ({
            action: 'verifyOTC:failed',
            actionErrorMessage: chooseBestErrorMessage(e, genericErrorMessage)
        }));
}

function verifyOTCAction(memberApi, data) {
    return memberApi.getIntegrityToken().then(integrityToken => {
        return memberApi.verifyOTC({...data, integrityToken});
    });
}

function signup({data, state, api}) {
    return signupAction(api.member, data, state)
        .then(() => ({
            page: 'magiclink',
            lastPage: 'signup',
            inboxLinks: data.inboxLinks,
            pageData: {
                ...(state.pageData || {}),
                email: (data.email || '').trim()
            }
        }))
        .catch(e => ({
            action: 'signup:failed',
            popupNotification: createPopupNotification({
                type: 'signup:failed', autoHide: false, closeable: true, state, status: 'error',
                message: chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
            })
        }));
}

function signupAction(memberApi, data, state) {
    const {plan, tierId, cadence, email, name, newsletters, offerId} = data;
    const trimmedName = name?.trim();

    if (plan.toLowerCase() === 'free') {
        return memberApi.getIntegrityToken().then(integrityToken => {
            const payload = {emailType: 'signup', integrityToken, ...data, name: trimmedName};
            return memberApi.sendMagicLink(payload).then(({inboxLinks}) => ({inboxLinks}));
        });
    }

    if (tierId && cadence) {
        return memberApi.checkoutPlan({plan, tierId, cadence, email, name: trimmedName, newsletters, offerId});
    }

    return getProductCadenceFromPrice({site: state?.site, priceId: plan}).then(({tierId, cadence}) => {
        return memberApi.checkoutPlan({plan, tierId, cadence, email, name: trimmedName, newsletters, offerId});
    });
}

function checkoutPlan({data, state, api}) {
    return checkoutPlanAction(api.member, data, state)
        .catch(e => ({
            action: 'checkoutPlan:failed',
            popupNotification: createPopupNotification({
                type: 'checkoutPlan:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to process checkout, please try again')
            })
        }));
}

function checkoutPlanAction(memberApi, data, state) {
    const {plan, offerId, tierId, cadence} = data;
    let resolvedTierId = tierId;
    let resolvedCadence = cadence;

    if (!tierId || !cadence) {
        const {tierId: resolvedTierId, cadence: resolvedCadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan});
    }

    return memberApi.checkoutPlan({
        plan,
        tierId: resolvedTierId,
        cadence: resolvedCadence,
        offerId,
        metadata: {
            checkoutType: 'upgrade'
        }
    });
}

function updateSubscription({data, state, api}) {
    return updateSubscriptionAction(api.member, data, state)
        .then(() => {
            return api.member.sessionData().then(member => ({
                action: 'updateSubscription:success',
                popupNotification: createPopupNotification({
                    type: 'updateSubscription:success', autoHide: true, closeable: true, state, status: 'success',
                    message: t('Subscription plan updated successfully')
                }),
                page: 'accountHome',
                member
            }));
        })
        .catch(e => ({
            action: 'updateSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'updateSubscription:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to update subscription, please try again')
            })
        }));
}

function updateSubscriptionAction(memberApi, data, state) {
    const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
    const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

    return memberApi.updateSubscription({
        planName: plan,
        tierId,
        cadence,
        subscriptionId,
        cancelAtPeriodEnd,
        planId
    });
}

function cancelSubscription({data, state, api}) {
    return cancelSubscriptionAction(api.member, data, state)
        .then(() => {
            return api.member.sessionData().then(member => ({
                action: 'cancelSubscription:success',
                page: 'accountHome',
                member
            }));
        })
        .catch(e => ({
            action: 'cancelSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'cancelSubscription:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to cancel subscription, please try again')
            })
        }));
}

function cancelSubscriptionAction(memberApi, data, state) {
    const {subscriptionId, cancellationReason} = data;
    return memberApi.updateSubscription({
        subscriptionId, smartCancel: true, cancellationReason
    });
}

function continueSubscription({data, state, api}) {
    return continueSubscriptionAction(api.member, data, state)
        .then(() => {
            return api.member.sessionData().then(member => ({
                action: 'continueSubscription:success',
                page: 'accountHome',
                member
            }));
        })
        .catch(e => ({
            action: 'continueSubscription:failed',
            popupNotification: createPopupNotification({
                type: 'continueSubscription:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to cancel subscription, please try again')
            })
        }));
}

function continueSubscriptionAction(memberApi, data, state) {
    const {subscriptionId} = data;
    return memberApi.updateSubscription({
        subscriptionId, cancelAtPeriodEnd: false
    });
}

function applyOffer({data, state, api}) {
    return applyOfferAction(api.member, data, state)
        .then(() => {
            return api.member.sessionData().then(member => ({
                action: 'applyOffer:success',
                page: 'accountHome',
                member,
                offers: [],
                popupNotification: createPopupNotification({
                    type: 'applyOffer:success', autoHide: true, closeable: true, state, status: 'success',
                    message: 'Offer applied successfully!'
                })
            }));
        })
        .catch(e => ({
            action: 'applyOffer:failed',
            popupNotification: createPopupNotification({
                type: 'applyOffer:failed', autoHide: false, closeable: true, state, status: 'error',
                message: 'Failed to apply offer, please try again'
            })
        }));
}

function applyOfferAction(memberApi, data, state) {
    const {offerId, subscriptionId} = data;
    return memberApi.applyOffer({
        offerId,
        subscriptionId
    });
}

function editBilling({data, state, api}) {
    return editBillingAction(api.member, data)
        .catch(e => ({
            action: 'editBilling:failed',
            popupNotification: createPopupNotification({
                type: 'editBilling:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to update billing information, please try again')
            })
        }));
}

function editBillingAction(memberApi, data) {
    return memberApi.editBilling(data);
}

function manageBilling({data, state, api}) {
    return manageBillingAction(api.member, data)
        .catch(e => ({
            action: 'manageBilling:failed',
            popupNotification: createPopupNotification({
                type: 'manageBilling:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to open billing portal, please try again')
            })
        }));
}

function manageBillingAction(memberApi, data) {
    return memberApi.manageBilling(data);
}

function clearPopupNotification() {
    return {
        popupNotification: null
    };
}

function showPopupNotification({data, state}) {
    const {action, message = ''} = data;
    const resolvedAction = action || 'showPopupNotification:success';
    return {
        popupNotification: createPopupNotification({
            type: resolvedAction,
            autoHide: true,
            closeable: true,
            state,
            status: 'success',
            message
        })
    };
}

function updateNewsletterPreference({data, state, api}) {
    return updateNewsletterPreferenceAction(api.member, data, state)
        .then(() => ({
            action: 'updateNewsletterPref:success',
            member: data.member
        }))
        .catch(e => ({
            action: 'updateNewsletterPref:failed',
            popupNotification: createPopupNotification({
                type: 'updateNewsletter:failed',
                autoHide: true, closeable: true, state, status: 'error',
                message: t('Failed to update newsletter settings')
            })
        }));
}

function updateNewsletterPreferenceAction(memberApi, data, state) {
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

    return memberApi.update(updateData);
}

function removeEmailFromSuppressionList({state, api}) {
    return removeEmailFromSuppressionListAction(api.member, state)
        .then(() => ({
            action: 'removeEmailFromSuppressionList:success',
            popupNotification: createPopupNotification({
                type: 'removeEmailFromSuppressionList:success', autoHide: true, closeable: true, state, status: 'success',
                message: t('You have been successfully resubscribed')
            })
        }))
        .catch(e => ({
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createPopupNotification({
                type: 'removeEmailFromSuppressionList:failed',
                autoHide: true, closeable: true, state, status: 'error',
                message: t('Your email has failed to resubscribe, please try again')
            })
        }));
}

function removeEmailFromSuppressionListAction(memberApi, state) {
    return memberApi.deleteSuppression();
}

function updateNewsletter({data, state, api}) {
    return updateNewsletterAction(api.member, data, state)
        .then(() => ({
            action: 'updateNewsletter:success',
            member: data.member,
            popupNotification: createPopupNotification({
                type: 'updateNewsletter:success', autoHide: true, closeable: true, state, status: 'success',
                message: t('Email newsletter settings updated')
            })
        }))
        .catch(e => ({
            action: 'updateNewsletter:failed',
            popupNotification: createPopupNotification({
                type: 'updateNewsletter:failed', autoHide: true, closeable: true, state, status: 'error',
                message: t('Failed to update newsletter settings')
            })
        }));
}

function updateNewsletterAction(memberApi, data, state) {
    const {subscribed} = data;
    return memberApi.update({subscribed}).then(member => {
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        return member;
    });
}

function updateMemberEmail({data, state, api}) {
    const {email} = data;
    const originalEmail = getMemberEmail({member: state.member});
    if (email !== originalEmail) {
        return updateMemberEmailAction(api.member, email)
            .then(() => ({success: true}))
            .catch(err => ({success: false, error: err}));
    }
    return null;
}

function updateMemberEmailAction(memberApi, email) {
    return memberApi.updateEmailAddress({email});
}

function updateMemberData({data, state, api}) {
    const name = data?.name?.trim();
    const originalName = getMemberName({member: state.member});

    if (originalName !== name) {
        return updateMemberDataAction(api.member, name)
            .then(member => {
                if (!member) {
                    throw new Error('Failed to update member');
                }
                return {member, success: true};
            })
            .catch(err => ({success: false, error: err}));
    }
    return null;
}

function updateMemberDataAction(memberApi, name) {
    return memberApi.update({name});
}

function refreshMemberData({state, api}) {
    if (state.member) {
        return refreshMemberDataAction(api.member)
            .then(member => {
                if (member) {
                    return {
                        member,
                        success: true,
                        action: 'refreshMemberData:success'
                    };
                }
                return null;
            })
            .catch(err => ({
                success: false,
                error: err,
                action: 'refreshMemberData:failed'
            }));
    }
    return null;
}

function refreshMemberDataAction(memberApi) {
    return memberApi.sessionData();
}

function updateProfile({data, state, api}) {
    return updateProfileAction(api.member, data, state)
        .then(() => ({
            action: 'updateProfile:success',
            member: data.member,
            page: 'accountHome',
            popupNotification: createPopupNotification({
                type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
                message: t('Check your inbox to verify email update')
            })
        }))
        .catch(e => {
            const message = !data.dataUpdate.success ? t('Failed to update account data') : t('Failed to send verification email');
            return {
                action: 'updateProfile:failed',
                member: data.dataUpdate.success ? data.member : undefined,
                popupNotification: createPopupNotification({
                    type: 'updateProfile:failed', autoHide: true, closeable: true, status: 'error', message, state
                })
            };
        });
}

function updateProfileAction(memberApi, data, state) {
    return Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]).then(([dataUpdate, emailUpdate]) => {
        if (dataUpdate && emailUpdate) {
            if (emailUpdate.success) {
                return {
                    action: 'updateProfile:success',
                    ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
                    page: 'accountHome',
                    popupNotification: createPopupNotification({
                        type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
                        message: t('Check your inbox to verify email update')
                    })
                };
            }

            const message = !dataUpdate.success ? t('Failed to update account data') : t('Failed to send verification email');
            return {
                action: 'updateProfile:failed',
                ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
                popupNotification: createPopupNotification({
                    type: 'updateProfile:failed', autoHide: true, closeable: true, status: 'error', message, state
                })
            };
        } else if (dataUpdate) {
            const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
            const status = dataUpdate.success ? 'success' : 'error';
            const message = !dataUpdate.success ? t('Failed to update account details') : t('Account details updated successfully');
            return {
                action,
                ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
                ...(dataUpdate.success ? {page: 'accountHome'} : {}),
                popupNotification: createPopupNotification({
                    type: action, autoHide: dataUpdate.success, closeable: true, status, state, message
                })
            };
        } else if (emailUpdate) {
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
                    type: action, autoHide: emailUpdate.success, closeable: true, status, state, message
                })
            };
        }
        return {
            action: 'updateProfile:success',
            page: 'accountHome',
            popupNotification: createPopupNotification({
                type: 'updateProfile:success', autoHide: true, closeable: true, status: 'success', state,
                message: t('Account details updated successfully')
            })
        };
    });
}

function oneClickSubscribe({data: {siteUrl}, state}) {
    const externalSiteApi = setupGhostApi({siteUrl: siteUrl, apiUrl: 'not-defined', contentApiKey: 'not-defined'});
    const {member} = state;

    const referrerUrl = window.location.href;
    const referrerSource = getRefDomain();

    return externalSiteApi.member.getIntegrityToken().then(integrityToken => {
        const customUrlHistory = state.site.outbound_link_tagging ? [
            {
                time: Date.now(),
                referrerSource,
                referrerMedium: 'Ghost Recommendations',
                referrerUrl
            }
        ] : [];

        return externalSiteApi.member.sendMagicLink({
            emailType: 'signup',
            name: member.name,
            email: member.email,
            autoRedirect: false,
            integrityToken,
            customUrlHistory
        });
    });
}

function trackRecommendationClicked({data: {recommendationId}, api}) {
    try {
        const existing = localStorage.getItem('ghost-recommendations-clicked');
        const clicked = existing ? JSON.parse(existing) : [];
        if (clicked.includes(recommendationId)) {
            return;
        }
        clicked.push(recommendationId);
        localStorage.setItem('ghost-recommendations-clicked', JSON.stringify(clicked));
    } catch (e) {
        // Ignore localstorage errors (browser not supported or in private mode)
    }
    api.recommendations.trackClicked({
        recommendationId
    });

    return {};
}

function trackRecommendationSubscribed({data: {recommendationId}, api}) {
    api.recommendations.trackSubscribed({
        recommendationId
    });

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