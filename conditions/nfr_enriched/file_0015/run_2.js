```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// ============================================================================
// Utility Functions
// ============================================================================

function createErrorNotification(type, message, state) {
    return createPopupNotification({
        type,
        autoHide: false,
        closeable: true,
        state,
        status: 'error',
        message
    });
}

function createSuccessNotification(type, message, state, autoHide = true) {
    return createPopupNotification({
        type,
        autoHide,
        closeable: true,
        state,
        status: 'success',
        message
    });
}

function normalizeEmail(email) {
    return (email || '').trim();
}

function normalizeName(name) {
    return name?.trim();
}

function extractPageData(data, state) {
    return {
        ...(state.pageData || {}),
        email: normalizeEmail(data?.email)
    };
}

async function getIntegrityTokenAndSendMagicLink(api, payload) {
    const integrityToken = await api.member.getIntegrityToken();
    return api.member.sendMagicLink({...payload, integrityToken});
}

function getPlanCadence(data, state) {
    const {tierId, cadence} = data;
    if (tierId && cadence) {
        return {tierId, cadence};
    }
    return getProductCadenceFromPrice({site: state?.site, priceId: data.plan});
}

// ============================================================================
// Page Navigation Actions
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
    return state.lastPage
        ? {page: state.lastPage}
        : closePopup({state});
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
// Notification Actions
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
        popupNotification: createSuccessNotification(action, message, state)
    };
}

// ============================================================================
// Authentication Actions
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
            popupNotification: createErrorNotification(
                'signout:failed',
                t('Failed to log out, please try again'),
                state
            )
        };
    }
}

async function signin({data, api, state}) {
    try {
        const {otc_ref: otcRef, inboxLinks} = await getIntegrityTokenAndSendMagicLink(api, {
            ...data,
            emailType: 'signin',
            includeOTC: true
        });

        return {
            page: 'magiclink',
            lastPage: 'signin',
            ...(otcRef ? {otcRef} : {}),
            inboxLinks,
            pageData: extractPageData(data, state)
        };
    } catch (e) {
        return {
            action: 'signin:failed',
            popupNotification: createErrorNotification(
                'signin:failed',
                chooseBestErrorMessage(e, t('Failed to log in, please try again')),
                state
            )
        };
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
        pageData: extractPageData(data, state),
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
// Signup & Checkout Actions
// ============================================================================

async function signup({data, state, api}) {
    try {
        const {plan, email, newsletters, offerId} = data;
        const name = normalizeName(data.name);
        const isFreeplan = plan.toLowerCase() === 'free';

        if (isFreeplan) {
            const {inboxLinks} = await getIntegrityTokenAndSendMagicLink(api, {
                emailType: 'signup',
                ...data,
                name
            });

            return {
                page: 'magiclink',
                lastPage: 'signup',
                inboxLinks,
                pageData: extractPageData(data, state)
            };
        }

        const {tierId, cadence} = getPlanCadence(data, state);
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});

        return {
            page: 'loading'
        };
    } catch (e) {
        return {
            action: 'signup:failed',
            popupNotification: createErrorNotification(
                'signup:failed',
                chooseBestErrorMessage(e, t('Failed to sign up, please try again')),
                state
            )
        };
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = getPlanCadence(data, state);

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
            popupNotification: createErrorNotification(
                'checkoutPlan:failed',
                t('Failed to process checkout, please try again'),
                state
            )
        };
    }
}

// ============================================================================
// Subscription Management Actions
// ============================================================================

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
            member,
            page: 'accountHome',
            popupNotification: createSuccessNotification(
                action,
                t('Subscription plan updated successfully'),
                state
            )
        };
    } catch (e) {
        return {
            action: 'updateSubscription:failed',
            popupNotification: createErrorNotification(
                'updateSubscription:failed',
                t('Failed to update subscription, please try again'),
                state
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
            popupNotification: createErrorNotification(
                'cancelSubscription:failed',
                t('Failed to cancel subscription, please try again'),
                state
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
            popupNotification: createErrorNotification(
                'continueSubscription:failed',
                t('Failed to cancel subscription, please try again'),
                state
            )
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
            popupNotification: createSuccessNotification(
                action,
                'Offer applied successfully!',
                state
            )
        };
    } catch (e) {
        return {
            action: 'applyOffer:failed',
            popupNotification: createErrorNotification(
                'applyOffer:failed',
                'Failed to apply offer, please try again',
                state
            )
        };
    }
}

// ============================================================================
// Billing Actions
// ============================================================================

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return {
            action: 'editBilling:failed',
            popupNotification: createErrorNotification(
                'editBilling:failed',
                t('Failed to update billing information, please try again'),
                state
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
            popupNotification: createErrorNotification(
                'manageBilling:failed',
                t('Failed to open billing portal, please try again'),
                state
            )
        };
    }
}

// ============================================================================
// Newsletter & Preference Actions
// ============================================================================

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
            popupNotification: createSuccessNotification(
                action,
                t('Email newsletter settings updated'),
                state
            )
        };
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: createErrorNotification(
                'updateNewsletter:failed',
                t('Failed to update newsletter settings'),
                state
            )
        };
    }
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

        return {
            action: 'updateNewsletterPref:success',
            member
        };
    } catch (e) {
        return {
            action: 'updateNewsletterPref:failed',
            popupNotification: createErrorNotification(
                'updateNewsletter:failed',
                t('Failed to update newsletter settings'),
                state
            )
        };
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();

        return {
            action: 'removeEmailFromSuppressionList:success',
            popupNotification: createSuccessNotification(
                'removeEmailFromSuppressionList:success',
                t('You have been successfully resubscribed'),
                state
            )
        };
    } catch (e) {
        return {
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createErrorNotification(
                'removeEmailFromSuppressionList:failed',
                t('Your email has failed to resubscribe, please try again'),
                state
            )
        };
    }
}

// ============================================================================
// Profile Update Actions
// ============================================================================

async function updateMemberEmail({data, state, api}) {
    const {email} = data;
    const originalEmail = getMemberEmail({member: state.member});

    if (email === originalEmail) {
        return null;
    }

    try {
        await api.member.updateEmailAddress({email});
        return {success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

async function updateMemberData({data, state, api}) {
    const name = normalizeName(data?.name);
    const originalName = getMemberName({member: state.member});

    if (originalName === name) {
        return null;
    }

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

async function refreshMemberData({state, api}) {
    if (!state.member) {
        return null;
    }

    try {
        const member =