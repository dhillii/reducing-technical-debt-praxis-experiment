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

/** Switches to a new page while preserving state. */
function switchPage({data, state}) {
    return {
        page: data.page,
        popupNotification: null,
        lastPage: data.lastPage || null,
        pageData: data.pageData || state.pageData
    };
}

/** Toggles the visibility of the popup. */
function togglePopup({state}) {
    return {showPopup: !state.showPopup};
}

/** Opens a popup with optional query and data. */
function openPopup({data}) {
    return {
        showPopup: true,
        page: data.page,
        ...(data.pageQuery ? {pageQuery: data.pageQuery} : {}),
        ...(data.pageData ? {pageData: data.pageData} : {})
    };
}

/** Navigates back to the previous page or closes the popup. */
function back({state}) {
    return state.lastPage ? {page: state.lastPage} : closePopup({state});
}

/** Closes the popup and resets related state. */
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

/** Opens a notification. */
function openNotification({data}) {
    return {showNotification: true, ...data};
}

/** Closes a notification. */
function closeNotification() {
    return {showNotification: false};
}

/** Signs out the current member. */
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

/** Signs in a member via magic link. */
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

/** Starts the OTC flow from a custom form. */
function startSigninOTCFromCustomForm({data, state}) {
    const email = (data?.email || '').trim();
    const otcRef = data?.otcRef;
    const inboxLinks = data?.inboxLinks;

    if (!otcRef) return {};

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

/** Verifies the one-time code. */
async function verifyOTC({data, api}) {
    const genericErrorMessage = t('Failed to verify code, please try again');

    try {
        const integrityToken = await api.member.getIntegrityToken();
        const response = await api.member.verifyOTC({ ...data, integrityToken });

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

/** Handles signup for free plan. */
async function handleFreePlanSignup(data, api, state) {
    const integrityToken = await api.member.getIntegrityToken();
    const {inboxLinks} = await api.member.sendMagicLink({
        emailType: 'signup',
        integrityToken,
        ...data,
        name: data.name?.trim()
    });
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

/** Handles signup for paid plan. */
async function handlePaidPlanSignup(data, api, state) {
    const {plan, tierId, cadence, email, name, newsletters, offerId} = data;
    if (tierId && cadence) {
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
    } else {
        const {tierId: tId, cadence: c} = getProductCadenceFromPrice({
            site: state?.site,
            priceId: plan
        });
        await api.member.checkoutPlan({plan, tierId: tId, cadence: c, email, name, newsletters, offerId});
    }
    return {page: 'loading'};
}

/** Signs up a new member. */
async function signup({data, state, api}) {
    try {
        const {plan} = data;
        if (plan.toLowerCase() === 'free') {
            return await handleFreePlanSignup(data, api, state);
        }
        return await handlePaidPlanSignup(data, api, state);
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

/** Checks out a plan. */
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

/** Updates a subscription. */
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

/** Cancels a subscription. */
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

/** Continues a subscription. */
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

/** Applies an offer to a subscription. */
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

/** Edits billing information. */
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

/** Manages billing portal. */
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

/** Clears the popup notification. */
async function clearPopupNotification() {
    return {popupNotification: null};
}

/** Shows a popup notification. */
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

/** Builds update data for newsletter preferences. */
function buildNewsletterUpdateData(newsletters, enableCommentNotifications) {
    const updateData = {};
    if (newsletters) updateData.newsletters = newsletters;
    if (enableCommentNotifications !== undefined)
        updateData.enableCommentNotifications = enableCommentNotifications;
    return updateData;
}

/** Updates newsletter preferences. */
async function updateNewsletterPreference({data, state, api}) {
    const {newsletters, enableCommentNotifications} = data;
    if (!newsletters && enableCommentNotifications === undefined) return {};

    const updateData = buildNewsletterUpdateData(newsletters, enableCommentNotifications);
    try {
        const member = await api.member.update(updateData);
        const action = 'updateNewsletterPref:success';
        return {action, member};
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

/** Removes an email from the suppression list. */
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

/** Updates newsletter subscription status. */
async function updateNewsletter({data, state, api}) {
    try {
        const {subscribed} = data;
        const member = await api.member.update({subscribed});
        if (!member) throw new Error('Failed to update newsletter');
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

/** Updates the member's email address. */
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

/** Updates the member's name. */
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

/** Refreshes the member data from the API. */
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

/** Handles profile updates (name and email). */
async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

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
    } else if (dataUpdate) {
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
    } else if (emailUpdate) {
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

/** Subscribes to a site with one click. */
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

/** Updates local storage for recommendation clicks. */
function updateRecommendationLocalStorage(recommendationId) {
    try {
        const existing = localStorage.getItem('ghost-recommendations-clicked');
        const clicked = existing ? JSON.parse(existing) : [];
        if (!clicked.includes(recommendationId)) {
            clicked.push(recommendationId);
            localStorage.setItem('ghost-recommendations-clicked', JSON.stringify(clicked));
        }
    } catch {
        // Ignore localstorage errors
    }
}

/** Tracks a recommendation click. */
function trackRecommendationClicked({data: {recommendationId}, api}) {
    updateRecommendationLocalStorage(recommendationId);
    api.recommendations.trackClicked({recommendationId});
    return {};
}

/** Tracks a recommendation subscription. */
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
        return (await handler({data, state, api})) || {};
    }
    return {};
}