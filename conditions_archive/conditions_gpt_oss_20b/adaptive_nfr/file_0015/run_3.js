import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

/** @private */
function isFreePlan(plan) {
    return plan.toLowerCase() === 'free';
}

/** @private */
function hasTierAndCadence(tierId, cadence) {
    return !!tierId && !!cadence;
}

/** @private */
function buildSignupSuccessResponse({inboxLinks, state, email}) {
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

/** @private */
function buildSignupFailedResponse(state, error) {
    const message = chooseBestErrorMessage(error, t('Failed to sign up, please try again'));
    return {
        action: 'signup:failed',
        popupNotification: createPopupNotification({
            type: 'signup:failed',
            autoHide: false,
            closeable: true,
            state,
            status: 'error',
            message
        })
    };
}

/** @private */
function buildVerifyOTCFailed(error, genericMessage) {
    return {
        action: 'verifyOTC:failed',
        actionErrorMessage: chooseBestErrorMessage(error, genericMessage)
    };
}

/** @private */
function buildSigninPayload(data, integrityToken) {
    return {
        ...data,
        emailType: 'signin',
        integrityToken,
        includeOTC: true
    };
}

/** @private */
function buildSigninSuccessResponse({otcRef, inboxLinks, state, data}) {
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

/** @private */
function buildSigninFailedResponse(error, state) {
    return {
        action: 'signin:failed',
        popupNotification: createPopupNotification({
            type: 'signin:failed',
            autoHide: false,
            closeable: true,
            state,
            status: 'error',
            message: chooseBestErrorMessage(error, t('Failed to log in, please try again'))
        })
    };
}

/** @private */
function buildSignoutFailedResponse(state) {
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

/** @private */
function buildStartSigninOTCResponse({email, otcRef, inboxLinks, state}) {
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

/** @private */
function handleBothUpdates(dataUpdate, emailUpdate) {
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

/** @private */
function handleDataUpdateOnly(dataUpdate) {
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

/** @private */
function handleEmailUpdateOnly(emailUpdate) {
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

/** @private */
function defaultSuccess() {
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

async function signout({api, state}) {
    try {
        await api.member.signout();
        return {
            action: 'signout:success'
        };
    } catch (e) {
        return buildSignoutFailedResponse(state);
    }
}

async function signin({data, api, state}) {
    try {
        const integrityToken = await api.member.getIntegrityToken();
        const payload = buildSigninPayload(data, integrityToken);
        const {otc_ref: otcRef, inboxLinks} = await api.member.sendMagicLink(payload);
        return buildSigninSuccessResponse({otcRef, inboxLinks, state, data});
    } catch (e) {
        return buildSigninFailedResponse(e, state);
    }
}

function startSigninOTCFromCustomForm({data, state}) {
    const otcRef = data?.otcRef;
    if (!otcRef) {
        return {};
    }
    const email = (data?.email || '').trim();
    const inboxLinks = data?.inboxLinks;
    return buildStartSigninOTCResponse({email, otcRef, inboxLinks, state});
}

async function verifyOTC({data, api}) {
    const genericErrorMessage = t('Failed to verify code, please try again');

    try {
        const integrityToken = await api.member.getIntegrityToken();
        const response = await api.member.verifyOTC({ ...data, integrityToken });

        if (response.redirectUrl) {
            return window.location.assign(response.redirectUrl);
        }

        return buildVerifyOTCFailed(response.errors?.[0], genericErrorMessage);
    } catch (e) {
        return buildVerifyOTCFailed(e, genericErrorMessage);
    }
}

async function signup({data, state, api}) {
    try {
        let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        name = name?.trim();

        let inboxLinks;
        if (isFreePlan(plan)) {
            const integrityToken = await api.member.getIntegrityToken();
            ({inboxLinks} = await api.member.sendMagicLink({emailType: 'signup', integrityToken, ...data, name}));
        } else {
            if (!hasTierAndCadence(tierId, cadence)) {
                ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
            }
            await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
            return {
                page: 'loading'
            };
        }
        return buildSignupSuccessResponse({inboxLinks, state, email});
    } catch (e) {
        return buildSignupFailedResponse(state, e);
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
            popupNotification: createPopupNotification({
                type: action,
                autoHide: true,
                closeable: true,
                state,
                status: 'success',
                message: t('Subscription plan updated successfully')
            }),
            page: 'accountHome',
            member: member
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

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return {
            action: 'editBilling:failed',
            popupNotification: createPopupNotification({
                type: 'editBilling:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
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
                type: 'manageBilling:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: t('Failed to open billing portal, please try again')
            })
        };
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
        const action = 'removeEmailFromSuppressionList:success';
        return {
            action,
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
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        const action = 'updateNewsletter:success';
        return {
            action,
            member: member,
            popupNotification: createPopupNotification({
                type: action,
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

async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([updateMemberData({data, state, api}), updateMemberEmail({data, state, api})]);

    if (dataUpdate && emailUpdate) {
        return handleBothUpdates(dataUpdate, emailUpdate);
    }
    if (dataUpdate) {
        return handleDataUpdateOnly(dataUpdate);
    }
    if (emailUpdate) {
        return handleEmailUpdateOnly(emailUpdate);
    }
    return defaultSuccess();
}

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