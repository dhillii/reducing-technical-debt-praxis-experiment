```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const createErrorNotification = (type, message, state) => ({
    action: type,
    popupNotification: createPopupNotification({
        type,
        autoHide: false,
        closeable: true,
        state,
        status: 'error',
        message
    })
});

const createSuccessNotification = (type, message, state, autoHide = true) => ({
    action: type,
    popupNotification: createPopupNotification({
        type,
        autoHide,
        closeable: true,
        state,
        status: 'success',
        message
    })
});

const trimEmail = (email) => (email || '').trim();

const buildPageData = (state, email) => ({
    ...state.pageData,
    email: trimEmail(email)
});

const getProductCadence = (state, plan) => {
    const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan});
    return {tierId, cadence};
};

const fetchMemberData = async (api) => api.member.sessionData();

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
        return {action: 'signout:success'};
    } catch (e) {
        return createErrorNotification(
            'signout:failed',
            t('Failed to log out, please try again'),
            state
        );
    }
}

async function signin({data, api, state}) {
    try {
        const integrityToken = await api.member.getIntegrityToken();
        const {otc_ref: otcRef, inboxLinks} = await api.member.sendMagicLink({
            ...data,
            emailType: 'signin',
            integrityToken,
            includeOTC: true
        });

        return {
            page: 'magiclink',
            lastPage: 'signin',
            ...(otcRef ? {otcRef} : {}),
            inboxLinks,
            pageData: buildPageData(state, data?.email)
        };
    } catch (e) {
        return createErrorNotification(
            'signin:failed',
            chooseBestErrorMessage(e, t('Failed to log in, please try again')),
            state
        );
    }
}

function startSigninOTCFromCustomForm({data, state}) {
    const otcRef = data?.otcRef;
    if (!otcRef) {
        return {};
    }

    return {
        showPopup: true,
        page: 'magiclink',
        lastPage: 'signin',
        otcRef,
        inboxLinks: data?.inboxLinks,
        pageData: buildPageData(state, data?.email),
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

async function signup({data, state, api}) {
    try {
        let {plan, tierId, cadence, email, name, newsletters, offerId} = data;
        name = name?.trim();

        if (plan.toLowerCase() === 'free') {
            const integrityToken = await api.member.getIntegrityToken();
            const {inboxLinks} = await api.member.sendMagicLink({
                emailType: 'signup',
                integrityToken,
                ...data,
                name
            });

            return {
                page: 'magiclink',
                lastPage: 'signup',
                inboxLinks,
                pageData: buildPageData(state, email)
            };
        }

        if (!tierId || !cadence) {
            ({tierId, cadence} = getProductCadence(state, plan));
        }

        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
        return {page: 'loading'};
    } catch (e) {
        return createErrorNotification(
            'signup:failed',
            chooseBestErrorMessage(e, t('Failed to sign up, please try again')),
            state
        );
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        let {plan, offerId, tierId, cadence} = data;

        if (!tierId || !cadence) {
            ({tierId, cadence} = getProductCadence(state, plan));
        }

        await api.member.checkoutPlan({
            plan,
            tierId,
            cadence,
            offerId,
            metadata: {checkoutType: 'upgrade'}
        });
    } catch (e) {
        return createErrorNotification(
            'checkoutPlan:failed',
            t('Failed to process checkout, please try again'),
            state
        );
    }
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT ACTIONS
// ============================================================================

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadence(state, planId);

        await api.member.updateSubscription({
            planName: plan,
            tierId,
            cadence,
            subscriptionId,
            cancelAtPeriodEnd,
            planId
        });

        const member = await fetchMemberData(api);
        return {
            action: 'updateSubscription:success',
            page: 'accountHome',
            member,
            popupNotification: createPopupNotification({
                type: 'updateSubscription:success',
                autoHide: true,
                closeable: true,
                state,
                status: 'success',
                message: t('Subscription plan updated successfully')
            })
        };
    } catch (e) {
        return createErrorNotification(
            'updateSubscription:failed',
            t('Failed to update subscription, please try again'),
            state
        );
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

        const member = await fetchMemberData(api);
        return {
            action: 'cancelSubscription:success',
            page: 'accountHome',
            member
        };
    } catch (e) {
        return createErrorNotification(
            'cancelSubscription:failed',
            t('Failed to cancel subscription, please try again'),
            state
        );
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({
            subscriptionId,
            cancelAtPeriodEnd: false
        });

        const member = await fetchMemberData(api);
        return {
            action: 'continueSubscription:success',
            page: 'accountHome',
            member
        };
    } catch (e) {
        return createErrorNotification(
            'continueSubscription:failed',
            t('Failed to cancel subscription, please try again'),
            state
        );
    }
}

async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({offerId, subscriptionId});

        const member = await fetchMemberData(api);
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
        return createErrorNotification(
            'applyOffer:failed',
            'Failed to apply offer, please try again',
            state
        );
    }
}

// ============================================================================
// BILLING ACTIONS
// ============================================================================

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return createErrorNotification(
            'editBilling:failed',
            t('Failed to update billing information, please try again'),
            state
        );
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return createErrorNotification(
            'manageBilling:failed',
            t('Failed to open billing portal, please try again'),
            state
        );
    }
}

// ============================================================================
// NEWSLETTER & PREFERENCE ACTIONS
// ============================================================================

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
        return {
            action: 'updateNewsletterPref:success',
            member
        };
    } catch (e) {
        return createErrorNotification(
            'updateNewsletter:failed',
            t('Failed to update newsletter settings'),
            state
        );
    }
}

async function updateNewsletter({data, state, api}) {
    try {
        const {subscribed} = data;
        const member = await api.member.update({subscribed});

        if (!member) {
            throw new Error('Failed to update newsletter');
        }

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
        return createErrorNotification(
            'updateNewsletter:failed',
            t('Failed to update newsletter settings'),
            state
        );
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        return createSuccessNotification(
            'removeEmailFromSuppressionList:success',
            t('You have been successfully resubscribed'),
            state
        );
    } catch (e) {
        return createErrorNotification(
            'removeEmailFromSuppressionList:failed',
            t('Your email has failed to resubscribe, please try again'),
            state
        );
    }
}

// ============================================================================
// PROFILE UPDATE ACTIONS
// ============================================================================

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
    if (!state.member) {
        return null;
    }

    try {
        const member = await fetchMemberData(api);
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

const buildProfileUpdateResponse = (dataUpdate, emailUpdate, state) => {
    const bothUpdated = dataUpdate && emailUpdate;
    const onlyData = dataUpdate && !emailUpdate;
    const onlyEmail = emailUpdate && !dataUpdate;

    if (bothUpdated) {
        if (emailUpdate.success) {
            return {
                action: 'updateProfile:success',
                ...(dataUpdate.success ? {member: dataUpdate.member} : {}),
                page: 'accountHome',
                popupNotification: createPopup