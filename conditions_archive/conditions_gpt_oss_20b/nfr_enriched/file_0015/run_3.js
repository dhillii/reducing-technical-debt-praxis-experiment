import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {
    createPopupNotification,
    getMemberEmail,
    getMemberName,
    getProductCadenceFromPrice,
    removePortalLinkFromUrl,
    getRefDomain
} from './utils/helpers';
import {t} from './utils/i18n';

/* -------------------------------------------------------------------------- */
/*  Helper functions for creating popup notifications                         */
/* -------------------------------------------------------------------------- */
function createErrorPopup(state, type, messageKey) {
    return createPopupNotification({
        type,
        autoHide: false,
        closeable: true,
        state,
        status: 'error',
        message: messageKey
    });
}

function createSuccessPopup(state, type, messageKey, autoHide = true) {
    return createPopupNotification({
        type,
        autoHide,
        closeable: true,
        state,
        status: 'success',
        message: messageKey
    });
}

/* -------------------------------------------------------------------------- */
/*  Action handlers                                                            */
/* -------------------------------------------------------------------------- */
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
    if (state.lastPage) {
        return {page: state.lastPage};
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
    return {showNotification: true, ...data};
}

function closeNotification() {
    return {showNotification: false};
}

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

/* -------------------------------------------------------------------------- */
/*  Sign‑in helpers                                                          */
/* -------------------------------------------------------------------------- */
async function handleFreePlanSignup({email, name, newsletters, offerId, api, state}) {
    const integrityToken = await api.member.getIntegrityToken();
    const {otc_ref: otcRef, inboxLinks} = await api.member.sendMagicLink({
        emailType: 'signup',
        integrityToken,
        email,
        name,
        newsletters,
        offerId
    });

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

async function handlePaidPlanSignup({plan, tierId, cadence, email, name, newsletters, offerId, api, state}) {
    if (tierId && cadence) {
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
    } else {
        const {tierId: newTierId, cadence: newCadence} = getProductCadenceFromPrice({
            site: state?.site,
            priceId: plan
        });
        await api.member.checkoutPlan({
            plan,
            tierId: newTierId,
            cadence: newCadence,
            email,
            name,
            newsletters,
            offerId
        });
    }
    return {page: 'loading'};
}

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

/* -------------------------------------------------------------------------- */
/*  Sign‑up helper functions                                                 */
/* -------------------------------------------------------------------------- */
async function signup({data, state, api}) {
    try {
        const {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        const trimmedName = name?.trim();

        if (plan.toLowerCase() === 'free') {
            return await handleFreePlanSignup({
                email,
                name: trimmedName,
                newsletters,
                offerId,
                api,
                state
            });
        }
        return await handlePaidPlanSignup({
            plan,
            tierId,
            cadence,
            email,
            name: trimmedName,
            newsletters,
            offerId,
            api,
            state
        });
    } catch (e) {
        const message = chooseBestErrorMessage(e, t('Failed to sign up, please try again'));
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
}

/* -------------------------------------------------------------------------- */
/*  Subscription helpers                                                     */
/* -------------------------------------------------------------------------- */
async function checkoutPlan({data, state, api}) {
    try {
        let {plan, offerId, tierId, cadence} = data;
        if (!tierId || !cadence) {
            ({tierId, cadence} = getProductCadenceFromPrice({
                site: state?.site,
                priceId: plan
            }));
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

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({
            site: state?.site,
            priceId: planId
        });

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
        await api.member.updateSubscription({
            subscriptionId,
            smartCancel: true,
            cancellationReason
        });
        const member = await api.member.sessionData();
        const action = 'cancelSubscription:success';
        return {action, page: 'accountHome', member};
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
        return {action, page: 'accountHome', member};
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
        await api.member.applyOffer({offerId, subscriptionId});
        const member = await api.member.sessionData();
        const action = 'applyOffer:success';
        return {
            action,
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

/* -------------------------------------------------------------------------- */
/*  Billing helpers                                                          */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/*  Notification helpers                                                    */
/* -------------------------------------------------------------------------- */
async function clearPopupNotification() {
    return {popupNotification: null};
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

/* -------------------------------------------------------------------------- */
/*  Newsletter helpers                                                      */
/* -------------------------------------------------------------------------- */
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
        return {action, member};
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
            member,
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

/* -------------------------------------------------------------------------- */
/*  Member helpers                                                          */
/* -------------------------------------------------------------------------- */
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
            if (!member) {
                throw new Error('Failed to update member');
            }
            return {member, success: true};
        } catch (err) {
            return {success: false, error: err};
        }
    }
    return null;
}

async function refreshMemberData({state, api}) {
    if (state.member) {
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
    return null;
}

/* -------------------------------------------------------------------------- */
/*  Profile update helpers                                                  */
/* -------------------------------------------------------------------------- */
function buildSuccessResponse(state, member, messageKey) {
    return {
        action: 'updateProfile:success',
        ...(member ? {member} : {}),
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success',
            autoHide: true,
            closeable: true,
            state,
            status: 'success',
            message: messageKey
        })
    };
}

function buildFailureResponse(state, member, messageKey, autoHide = false) {
    return {
        action: 'updateProfile:failed',
        ...(member ? {member} : {}),
        popupNotification: createPopupNotification({
            type: 'updateProfile:failed',
            autoHide,
            closeable: true,
            state,
            status: 'error',
            message: messageKey
        })
    };
}

async function updateProfile({data, state, api}) {
    const [dataResult, emailResult] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    if (dataResult && emailResult) {
        if (emailResult.success) {
            return buildSuccessResponse(
                state,
                dataResult.member,
                t('Check your inbox to verify email update')
            );
        }

        const message = !dataResult.success
            ? t('Failed to update account data')
            : t('Failed to send verification email');
        return buildFailureResponse(
            state,
            dataResult.member,
            message,
            dataResult.success
        );
    } else if (dataResult) {
        const action = dataResult.success ? 'updateProfile:success' : 'updateProfile:failed';
        const status = dataResult.success ? 'success' : 'error';
        const message = !dataResult.success
            ? t('Failed to update account details')
            : t('Account details updated successfully');
        return {
            action,
            ...(dataResult.success ? {member: dataResult.member} : {}),
            ...(dataResult.success ? {page: 'accountHome'} : {}),
            popupNotification: createPopupNotification({
                type: action,
                autoHide: dataResult.success,
                closeable: true,
                state,
                status,
                message
            })
        };
    } else if (emailResult) {
        const action = emailResult.success ? 'updateProfile:success' : 'updateProfile:failed';
        const status = emailResult.success ? 'success' : 'error';
        let message = '';

        if (emailResult.error) {
            message = chooseBestErrorMessage(emailResult.error, t('Failed to send verification email'));
        } else {
            message = t('Check your inbox to verify email update');
        }

        return {
            action,
            ...(emailResult.success ? {page: 'accountHome'} : {}),
            popupNotification: createPopupNotification({
                type: action,
                autoHide: emailResult.success,
                closeable: true,
                state,
                status,
                message
            })
        };
    }

    return buildSuccessResponse(state, null, t('Account details updated successfully'));
}

/* -------------------------------------------------------------------------- */
/*  One‑click subscribe                                                     */
/* -------------------------------------------------------------------------- */
async function oneClickSubscribe({data: {siteUrl}, state}) {
    const externalSiteApi = setupGhostApi({
        siteUrl,
        apiUrl: 'not-defined',
        contentApiKey: 'not-defined'
    });
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
            ? [
                  {
                      time: Date.now(),
                      referrerSource,
                      referrerMedium: 'Ghost Recommendations',
                      referrerUrl
                  }
              ]
            : []
    });

    return {};
}

/* -------------------------------------------------------------------------- */
/*  Recommendation tracking                                                 */
/* -------------------------------------------------------------------------- */
function trackRecommendationClicked({data: {recommendationId}, api}) {
    try {
        const existing = localStorage.getItem('ghost-recommendations-clicked');
        const clicked = existing ? JSON.parse(existing) : [];
        if (!clicked.includes(recommendationId)) {
            clicked.push(recommendationId);
            localStorage.setItem('ghost-recommendations-clicked', JSON.stringify(clicked));
        }
    } catch {
        // ignore localstorage errors
    }
    api.recommendations.trackClicked({recommendationId});
    return {};
}

async function trackRecommendationSubscribed({data: {recommendationId}, api}) {
    api.recommendations.trackSubscribed({recommendationId});
    return {};
}

/* -------------------------------------------------------------------------- */
/*  Actions registry                                                         */
/* -------------------------------------------------------------------------- */
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