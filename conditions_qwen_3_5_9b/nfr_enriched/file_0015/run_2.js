```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// Helper function to create error notification
function createErrorNotification({type, state, message}) {
    return createPopupNotification({
        type, autoHide: false, closeable: true, state, status: 'error', message
    });
}

// Helper function to create success notification
function createSuccessNotification({type, state, message, autoHide = true}) {
    return createPopupNotification({
        type, autoHide, closeable: true, state, status: 'success', message
    });
}

// Helper function to create magiclink page response
function createMagiclinkResponse({data, state, otcRef, inboxLinks}) {
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
}

// Helper function to create account home response
function createAccountHomeResponse({member, action, state, message}) {
    return {
        action,
        page: 'accountHome',
        member,
        popupNotification: createSuccessNotification({
            type: action, autoHide: true, state, message
        })
    };
}

// Helper function to create failed response
function createFailedResponse({type, state, message}) {
    return {
        action: `${type}:failed`,
        popupNotification: createErrorNotification({
            type: `${type}:failed`, state, message
        })
    };
}

// Helper function to create success response
function createSuccessResponse({type, state, message}) {
    return {
        action: `${type}:success`,
        popupNotification: createSuccessNotification({
            type: `${type}:success`, state, message
        })
    };
}

// Helper function to create notification response
function createNotificationResponse({data, state}) {
    return {
        showNotification: true,
        ...data
    };
}

// Helper function to close notification
function closeNotification() {
    return {
        showNotification: false
    };
}

// Helper function to switch page
function switchPage({data, state}) {
    return {
        page: data.page,
        popupNotification: null,
        lastPage: data.lastPage || null,
        pageData: data.pageData || state.pageData
    };
}

// Helper function to toggle popup
function togglePopup({state}) {
    return {
        showPopup: !state.showPopup
    };
}

// Helper function to open popup
function openPopup({data}) {
    return {
        showPopup: true,
        page: data.page,
        ...(data.pageQuery ? {pageQuery: data.pageQuery} : {}),
        ...(data.pageData ? {pageData: data.pageData} : {})
    };
}

// Helper function to go back
function back({state}) {
    if (state.lastPage) {
        return {
            page: state.lastPage
        };
    }
    return closePopup({state});
}

// Helper function to close popup
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

// Helper function to start OTC signin from custom form
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

// Helper function to verify OTC
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

// Helper function to sign out
async function signout({api, state}) {
    try {
        await api.member.signout();
        return {
            action: 'signout:success'
        };
    } catch (e) {
        return {
            action: 'signout:failed',
            popupNotification: createErrorNotification({
                type: 'signout:failed', state, message: t('Failed to log out, please try again')
            })
        };
    }
}

// Helper function to sign in
async function signin({data, api, state}) {
    try {
        const integrityToken = await api.member.getIntegrityToken();
        const payload = {
            ...data,
            emailType: 'signin',
            integrityToken,
            includeOTC: true
        };
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
            popupNotification: createErrorNotification({
                type: 'signin:failed', state, message: t('Failed to log in, please try again')
            })
        };
    }
}

// Helper function to signup
async function signup({data, state, api}) {
    try {
        let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        name = name?.trim();

        let inboxLinks;
        if (plan.toLowerCase() === 'free') {
            const integrityToken = await api.member.getIntegrityToken();
            ({inboxLinks} = await api.member.sendMagicLink({emailType: 'signup', integrityToken, ...data, name}));
        } else {
            if (tierId && cadence) {
                await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
            } else {
                ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
                await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
            }
            return {
                page: 'loading'
            };
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
    } catch (e) {
        const message = chooseBestErrorMessage(e, t('Failed to sign up, please try again'));
        return {
            action: 'signup:failed',
            popupNotification: createErrorNotification({
                type: 'signup:failed', state, message
            })
        };
    }
}

// Helper function to checkout plan
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
        return {
            action: 'checkoutPlan:failed',
            popupNotification: createErrorNotification({
                type: 'checkoutPlan:failed', state, message: t('Failed to process checkout, please try again')
            })
        };
    }
}

// Helper function to update subscription
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
            popupNotification: createSuccessNotification({
                type: action, state, message: t('Subscription plan updated successfully')
            }),
            page: 'accountHome',
            member: member
        };
    } catch (e) {
        return {
            action: 'updateSubscription:failed',
            popupNotification: createErrorNotification({
                type: 'updateSubscription:failed', state, message: t('Failed to update subscription, please try again')
            })
        };
    }
}

// Helper function to cancel subscription
async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({
            subscriptionId, smartCancel: true, cancellationReason
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
            popupNotification: createErrorNotification({
                type: 'cancelSubscription:failed', state, message: t('Failed to cancel subscription, please try again')
            })
        };
    }
}

// Helper function to continue subscription
async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({
            subscriptionId, cancelAtPeriodEnd: false
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
            popupNotification: createErrorNotification({
                type: 'continueSubscription:failed', state, message: t('Failed to cancel subscription, please try again')
            })
        };
    }
}

// Helper function to apply offer
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
            popupNotification: createSuccessNotification({
                type: 'applyOffer:success', state, message: 'Offer applied successfully!'
            })
        };
    } catch (e) {
        return {
            action: 'applyOffer:failed',
            popupNotification: createErrorNotification({
                type: 'applyOffer:failed', state, message: 'Failed to apply offer, please try again'
            })
        };
    }
}

// Helper function to edit billing
async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return {
            action: 'editBilling:failed',
            popupNotification: createErrorNotification({
                type: 'editBilling:failed', state, message: t('Failed to update billing information, please try again')
            })
        };
    }
}

// Helper function to manage billing
async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return {
            action: 'manageBilling:failed',
            popupNotification: createErrorNotification({
                type: 'manageBilling:failed', state, message: t('Failed to open billing portal, please try again')
            })
        };
    }
}

// Helper function to clear popup notification
async function clearPopupNotification() {
    return {
        popupNotification: null
    };
}

// Helper function to show popup notification
async function showPopupNotification({data, state}) {
    let {action, message = ''} = data;
    action = action || 'showPopupNotification:success';
    return {
        popupNotification: createSuccessNotification({
            type: action, state, message
        })
    };
}

// Helper function to update newsletter preference
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
        return {
            action,
            member
        };
    } catch (e) {
        return {
            action: 'updateNewsletterPref:failed',
            popupNotification: createErrorNotification({
                type: 'updateNewsletter:failed', state, message: t('Failed to update newsletter settings')
            })
        };
    }
}

// Helper function to remove email from suppression list
async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        const action = 'removeEmailFromSuppressionList:success';
        return {
            action,
            popupNotification: createSuccessNotification({
                type: 'removeEmailFromSuppressionList:success', state, message: t('You have been successfully resubscribed')
            })
        };
    } catch (e) {
        return {
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createErrorNotification({
                type: 'removeEmailFromSuppressionList:failed', state, message: t('Your email has failed to resubscribe, please try again')
            })
        };
    }
}

// Helper function to update newsletter
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
            popupNotification: createSuccessNotification({
                type: action, state, message: t('Email newsletter settings updated')
            })
        };
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: createErrorNotification({
                type: 'updateNewsletter:failed', state, message: t('Failed to update newsletter settings')
            })
        };
    }
}

// Helper function to update member email
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

// Helper function to update member data
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

// Helper function to refresh member data
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

// Helper function to update profile
async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([updateMemberData({data, state, api}), updateMemberEmail({data, state, api})]);
    
    if (dataUpdate && emailUpdate) {
        if (emailUpdate.success) {
            return {
                action: 'updateProfile:success',
                ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
                page: 'accountHome',
                popupNotification: createSuccessNotification({
                    type: 'updateProfile:success', state, message: t('Check your inbox to verify email update')
                })
            };
        }

        const message = !dataUpdate.success ? t('Failed to update account data') : t('Failed to send verification email');
        return {
            action: 'updateProfile:failed',
            ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
            popupNotification: createErrorNotification({
                type: 'updateProfile:failed', state, message
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
            popupNotification: createSuccessNotification({
                type: action, state, message
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
            popupNotification: createSuccessNotification({
                type: action, state, message
            })
        };
    }
    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createSuccessNotification({
            type: 'updateProfile:success', state, message: t('Account details updated successfully')
        })
    };
}

// Helper function to one click subscribe
async function oneClickSubscribe({data: {siteUrl}, state}) {
    const externalSiteApi = setupGhostApi({siteUrl: siteUrl, apiUrl: 'not-defined', contentApiKey: 'not-defined'});
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
        customUrlHistory: state.site.outbound_link_tagging ? [
            {
                time: Date.now(),
                referrerSource,
                referrerMedium: 'Ghost Recommendations',
                referrerUrl
            }
        ] : []
    });

    return {};
}

// Helper function to track recommendation clicked
function trackRecommendationClicked({data: {recommendationId}, api}) {
    try {
        const existing = localStorage.getItem('ghost-recommendations-clicked');
        const clicked = existing ? JSON.parse(existing) : [];
        if (clicked.includes(recommendationId)) {
            // Already tracked
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

// Helper function to track recommendation subscribed
async function trackRecommendationSubscribed({data: {recommendationId}, api}) {
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
```