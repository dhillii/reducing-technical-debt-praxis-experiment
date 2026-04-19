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
/* Helper utilities – keep cognitive complexity low by isolating logic        */
/* -------------------------------------------------------------------------- */

function buildPopup(type, state, status, message, autoHide = true, closeable = true) {
    return createPopupNotification({
        type,
        autoHide,
        closeable,
        state,
        status,
        message
    });
}

function buildMagicLinkResponse(page, lastPage, inboxLinks, email, state) {
    return {
        page,
        lastPage,
        inboxLinks,
        pageData: {
            ...(state.pageData || {}),
            email: (email || '').trim()
        }
    };
}

function getCadence(plan, state) {
    return getProductCadenceFromPrice({site: state?.site, priceId: plan});
}

/* -------------------------------------------------------------------------- */
/* Action implementations – each function now has a single responsibility    */
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

async function signout({api, state}) {
    try {
        await api.member.signout();
        return {action: 'signout:success'};
    } catch (e) {
        return {
            action: 'signout:failed',
            popupNotification: buildPopup(
                'signout:failed',
                state,
                'error',
                t('Failed to log out, please try again'),
                false
            )
        };
    }
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
            popupNotification: buildPopup(
                'signin:failed',
                state,
                'error',
                chooseBestErrorMessage(e, t('Failed to log in, please try again')),
                false
            )
        };
    }
}

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

/* -------------------------------------------------------------------------- */
/* Signup – split into free and paid plan handlers                           */
/* -------------------------------------------------------------------------- */

async function handleFreePlanSignup({email, name, api, data}) {
    const integrityToken = await api.member.getIntegrityToken();
    const {inboxLinks} = await api.member.sendMagicLink({
        emailType: 'signup',
        integrityToken,
        ...data,
        name
    });

    return buildMagicLinkResponse('magiclink', 'signup', inboxLinks, email, data);
}

async function handlePaidPlanSignup({plan, tierId, cadence, email, name, newsletters, offerId, state, api}) {
    if (tierId && cadence) {
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
    } else {
        const {tierId: tId, cadence: c} = getCadence(plan, state);
        await api.member.checkoutPlan({plan, tierId: tId, cadence: c, email, name, newsletters, offerId});
    }
    return {page: 'loading'};
}

async function signup({data, state, api}) {
    try {
        const {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        const trimmedName = name?.trim();

        if (plan.toLowerCase() === 'free') {
            return await handleFreePlanSignup({email, name: trimmedName, api, data});
        }
        return await handlePaidPlanSignup({
            plan,
            tierId,
            cadence,
            email,
            name: trimmedName,
            newsletters,
            offerId,
            state,
            api
        });
    } catch (e) {
        const message = chooseBestErrorMessage(e, t('Failed to sign up, please try again'));
        return {
            action: 'signup:failed',
            popupNotification: buildPopup('signup:failed', state, 'error', message, false)
        };
    }
}

/* -------------------------------------------------------------------------- */
/* Checkout plan – separate cadence resolution                               */
/* -------------------------------------------------------------------------- */

async function checkoutPlan({data, state, api}) {
    try {
        let {plan, offerId, tierId, cadence} = data;
        if (!tierId || !cadence) {
            ({tierId, cadence} = getCadence(plan, state));
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
            popupNotification: buildPopup(
                'checkoutPlan:failed',
                state,
                'error',
                t('Failed to process checkout, please try again'),
                false
            )
        };
    }
}

/* -------------------------------------------------------------------------- */
/* Subscription updates – common response builder                           */
/* -------------------------------------------------------------------------- */

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getCadence(planId, state);

        await api.member.updateSubscription({
            planName: plan,
            tierId,
            cadence,
            subscriptionId,
            cancelAtPeriodEnd,
            planId
        });

        const member = await api.member.sessionData();
        return {
            action: 'updateSubscription:success',
            popupNotification: buildPopup(
                'updateSubscription:success',
                state,
                'success',
                t('Subscription plan updated successfully')
            ),
            page: 'accountHome',
            member
        };
    } catch (e) {
        return {
            action: 'updateSubscription:failed',
            popupNotification: buildPopup(
                'updateSubscription:failed',
                state,
                'error',
                t('Failed to update subscription, please try again'),
                false
            )
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
        return {
            action: 'cancelSubscription:success',
            page: 'accountHome',
            member
        };
    } catch (e) {
        return {
            action: 'cancelSubscription:failed',
            popupNotification: buildPopup(
                'cancelSubscription:failed',
                state,
                'error',
                t('Failed to cancel subscription, please try again'),
                false
            )
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
        return {
            action: 'continueSubscription:success',
            page: 'accountHome',
            member
        };
    } catch (e) {
        return {
            action: 'continueSubscription:failed',
            popupNotification: buildPopup(
                'continueSubscription:failed',
                state,
                'error',
                t('Failed to cancel subscription, please try again'),
                false
            )
        };
    }
}

/* -------------------------------------------------------------------------- */
/* Offer application – separate response handling                            */
/* -------------------------------------------------------------------------- */

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
            popupNotification: buildPopup(
                'applyOffer:success',
                state,
                'success',
                'Offer applied successfully!',
                true
            )
        };
    } catch (e) {
        return {
            action: 'applyOffer:failed',
            popupNotification: buildPopup(
                'applyOffer:failed',
                state,
                'error',
                'Failed to apply offer, please try again',
                false
            )
        };
    }
}

/* -------------------------------------------------------------------------- */
/* Billing – simple wrappers with error handling                            */
/* -------------------------------------------------------------------------- */

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return {
            action: 'editBilling:failed',
            popupNotification: buildPopup(
                'editBilling:failed',
                state,
                'error',
                t('Failed to update billing information, please try again'),
                false
            )
        };
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return {
            action: 'manageBilling:failed',
            popupNotification: buildPopup(
                'manageBilling:failed',
                state,
                'error',
                t('Failed to open billing portal, please try again'),
                false
            )
        };
    }
}

/* -------------------------------------------------------------------------- */
/* Newsletter preferences – build update payload and handle response         */
/* -------------------------------------------------------------------------- */

async function updateNewsletterPreference({data, state, api}) {
    try {
        const {newsletters, enableCommentNotifications} = data;
        if (!newsletters && enableCommentNotifications === undefined) return {};

        const updateData = {};
        if (newsletters) updateData.newsletters = newsletters;
        if (enableCommentNotifications !== undefined)
            updateData.enableCommentNotifications = enableCommentNotifications;

        await api.member.update(updateData);
        return {action: 'updateNewsletterPref:success'};
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: buildPopup(
                'updateNewsletter:failed',
                state,
                'error',
                t('Failed to update newsletter settings'),
                true
            )
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
            popupNotification: buildPopup(
                'updateNewsletter:success',
                state,
                'success',
                t('Email newsletter settings updated')
            )
        };
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: buildPopup(
                'updateNewsletter:failed',
                state,
                'error',
                t('Failed to update newsletter settings')
            )
        };
    }
}

/* -------------------------------------------------------------------------- */
/* Member email & data updates – separate handlers                           */
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
            if (!member) throw new Error('Failed to update member');
            return {member, success: true};
        } catch (err) {
            return {success: false, error: err};
        }
    }
    return null;
}

/* -------------------------------------------------------------------------- */
/* Member data refresh – simple wrapper                                       */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Profile update – orchestrates member data and email updates               */
/* -------------------------------------------------------------------------- */

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
                popupNotification: buildPopup(
                    'updateProfile:success',
                    state,
                    'success',
                    t('Check your inbox to verify email update')
                )
            };
        }

        const message = !dataUpdate.success
            ? t('Failed to update account data')
            : t('Failed to send verification email');
        return {
            action: 'updateProfile:failed',
            ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
            popupNotification: buildPopup(
                'updateProfile:failed',
                state,
                'error',
                message
            )
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
            popupNotification: buildPopup(
                action,
                state,
                status,
                message,
                dataUpdate.success
            )
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
            popupNotification: buildPopup(
                action,
                state,
                status,
                message,
                emailUpdate.success
            )
        };
    }

    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: buildPopup(
            'updateProfile:success',
            state,
            'success',
            t('Account details updated successfully')
        )
    };
}

/* -------------------------------------------------------------------------- */
/* One‑click subscribe – external API call                                   */
/* -------------------------------------------------------------------------- */

async function oneClickSubscribe({data: {siteUrl}, state}) {
    const externalApi = setupGhostApi({
        siteUrl,
        apiUrl: 'not-defined',
        contentApiKey: 'not-defined'
    });

    const {member} = state;
    const referrerUrl = window.location.href;
    const referrerSource = getRefDomain();

    const integrityToken = await externalApi.member.getIntegrityToken();
    await externalApi.member.sendMagicLink({
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
/* Recommendation tracking – localStorage + API                               */
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
        // ignore localStorage errors
    }
    api.recommendations.trackClicked({recommendationId});
    return {};
}

async function trackRecommendationSubscribed({data: {recommendationId}, api}) {
    api.recommendations.trackSubscribed({recommendationId});
    return {};
}

/* -------------------------------------------------------------------------- */
/* Action registry – keep public API unchanged                               */
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
    clearPopupNotification: async () => ({popupNotification: null}),
    editBilling,
    manageBilling,
    checkoutPlan,
    updateNewsletterPreference,
    showPopupNotification: async ({data, state}) => {
        const {action, message = ''} = data;
        const type = action || 'showPopupNotification:success';
        return {
            popupNotification: buildPopup(type, state, 'success', message)
        };
    },
    removeEmailFromSuppressionList: async ({state, api}) => {
        try {
            await api.member.deleteSuppression();
            return {
                action: 'removeEmailFromSuppressionList:success',
                popupNotification: buildPopup(
                    'removeEmailFromSuppressionList:success',
                    state,
                    'success',
                    t('You have been successfully resubscribed')
                )
            };
        } catch (e) {
            return {
                action: 'removeEmailFromSuppressionList:failed',
                popupNotification: buildPopup(
                    'removeEmailFromSuppressionList:failed',
                    state,
                    'error',
                    t('Your email has failed to resubscribe, please try again')
                )
            };
        }
    },
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