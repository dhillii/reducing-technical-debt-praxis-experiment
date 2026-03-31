```javascript
import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

// ─── Notification Helpers ────────────────────────────────────────────────────

function createErrorNotification({type, state, message, autoHide = false}) {
    return createPopupNotification({type, autoHide, closeable: true, state, status: 'error', message});
}

function createSuccessNotification({type, state, message, autoHide = true}) {
    return createPopupNotification({type, autoHide, closeable: true, state, status: 'success', message});
}

function buildActionError({action, state, message, autoHide = false}) {
    return {
        action: `${action}:failed`,
        popupNotification: createErrorNotification({type: `${action}:failed`, state, message, autoHide})
    };
}

function buildActionSuccess({action, state, message, extra = {}}) {
    return {
        action: `${action}:success`,
        popupNotification: createSuccessNotification({type: `${action}:success`, state, message}),
        ...extra
    };
}

// ─── Popup / Navigation ──────────────────────────────────────────────────────

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

function back({state}) {
    return state.lastPage ? {page: state.lastPage} : closePopup({state});
}

function openNotification({data}) {
    return {showNotification: true, ...data};
}

function closeNotification() {
    return {showNotification: false};
}

function clearPopupNotification() {
    return {popupNotification: null};
}

async function showPopupNotification({data, state}) {
    const action = data.action || 'showPopupNotification:success';
    const message = data.message || '';
    return {
        popupNotification: createSuccessNotification({type: action, state, message})
    };
}

// ─── Magic Link Helpers ──────────────────────────────────────────────────────

function buildMagicLinkPageState({lastPage, otcRef, inboxLinks, email, state}) {
    return {
        page: 'magiclink',
        lastPage,
        ...(otcRef ? {otcRef} : {}),
        inboxLinks,
        pageData: {
            ...(state.pageData || {}),
            email: (email || '').trim()
        }
    };
}

async function sendMagicLinkWithIntegrity({api, payload}) {
    const integrityToken = await api.member.getIntegrityToken();
    return api.member.sendMagicLink({...payload, integrityToken});
}

// ─── Auth Actions ────────────────────────────────────────────────────────────

async function signout({api, state}) {
    try {
        await api.member.signout();
        return {action: 'signout:success'};
    } catch (e) {
        return buildActionError({
            action: 'signout',
            state,
            message: t('Failed to log out, please try again')
        });
    }
}

async function signin({data, api, state}) {
    try {
        const {otc_ref: otcRef, inboxLinks} = await sendMagicLinkWithIntegrity({
            api,
            payload: {...data, emailType: 'signin', includeOTC: true}
        });
        return buildMagicLinkPageState({
            lastPage: 'signin',
            otcRef,
            inboxLinks,
            email: data?.email,
            state
        });
    } catch (e) {
        return buildActionError({
            action: 'signin',
            state,
            message: chooseBestErrorMessage(e, t('Failed to log in, please try again'))
        });
    }
}

function startSigninOTCFromCustomForm({data, state}) {
    const otcRef = data?.otcRef;
    if (!otcRef) {
        return {};
    }
    return {
        showPopup: true,
        popupNotification: null,
        ...buildMagicLinkPageState({
            lastPage: 'signin',
            otcRef,
            inboxLinks: data?.inboxLinks,
            email: data?.email,
            state
        })
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

// ─── Signup / Checkout ───────────────────────────────────────────────────────

function resolveProductCadence({data, state}) {
    let {plan, tierId, cadence} = data;
    if (!tierId || !cadence) {
        ({tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: plan}));
    }
    return {tierId, cadence};
}

async function signup({data, state, api}) {
    try {
        let {plan, email, name, newsletters, offerId} = data;
        name = name?.trim();

        if (plan.toLowerCase() === 'free') {
            const {inboxLinks} = await sendMagicLinkWithIntegrity({
                api,
                payload: {...data, emailType: 'signup', name}
            });
            return buildMagicLinkPageState({lastPage: 'signup', inboxLinks, email, state});
        }

        const {tierId, cadence} = resolveProductCadence({data, state});
        await api.member.checkoutPlan({plan, tierId, cadence, email, name, newsletters, offerId});
        return {page: 'loading'};
    } catch (e) {
        return buildActionError({
            action: 'signup',
            state,
            message: chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
        });
    }
}

async function checkoutPlan({data, state, api}) {
    try {
        const {plan, offerId} = data;
        const {tierId, cadence} = resolveProductCadence({data, state});
        await api.member.checkoutPlan({plan, tierId, cadence, offerId, metadata: {checkoutType: 'upgrade'}});
    } catch (e) {
        return buildActionError({
            action: 'checkoutPlan',
            state,
            message: t('Failed to process checkout, please try again')
        });
    }
}

// ─── Subscription Actions ────────────────────────────────────────────────────

async function fetchMemberAfterUpdate(api) {
    return api.member.sessionData();
}

async function updateSubscription({data, state, api}) {
    try {
        const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
        const {tierId, cadence} = getProductCadenceFromPrice({site: state?.site, priceId: planId});

        await api.member.updateSubscription({planName: plan, tierId, cadence, subscriptionId, cancelAtPeriodEnd, planId});
        const member = await fetchMemberAfterUpdate(api);

        return buildActionSuccess({
            action: 'updateSubscription',
            state,
            message: t('Subscription plan updated successfully'),
            extra: {page: 'accountHome', member}
        });
    } catch (e) {
        return buildActionError({
            action: 'updateSubscription',
            state,
            message: t('Failed to update subscription, please try again')
        });
    }
}

async function cancelSubscription({data, state, api}) {
    try {
        const {subscriptionId, cancellationReason} = data;
        await api.member.updateSubscription({subscriptionId, smartCancel: true, cancellationReason});
        const member = await fetchMemberAfterUpdate(api);
        return {action: 'cancelSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return buildActionError({
            action: 'cancelSubscription',
            state,
            message: t('Failed to cancel subscription, please try again')
        });
    }
}

async function continueSubscription({data, state, api}) {
    try {
        const {subscriptionId} = data;
        await api.member.updateSubscription({subscriptionId, cancelAtPeriodEnd: false});
        const member = await fetchMemberAfterUpdate(api);
        return {action: 'continueSubscription:success', page: 'accountHome', member};
    } catch (e) {
        return buildActionError({
            action: 'continueSubscription',
            state,
            message: t('Failed to cancel subscription, please try again')
        });
    }
}

async function applyOffer({data, state, api}) {
    try {
        const {offerId, subscriptionId} = data;
        await api.member.applyOffer({offerId, subscriptionId});
        const member = await fetchMemberAfterUpdate(api);
        return buildActionSuccess({
            action: 'applyOffer',
            state,
            message: 'Offer applied successfully!',
            extra: {page: 'accountHome', member, offers: []}
        });
    } catch (e) {
        return buildActionError({
            action: 'applyOffer',
            state,
            message: 'Failed to apply offer, please try again'
        });
    }
}

// ─── Billing Actions ─────────────────────────────────────────────────────────

async function editBilling({data, state, api}) {
    try {
        await api.member.editBilling(data);
    } catch (e) {
        return buildActionError({
            action: 'editBilling',
            state,
            message: t('Failed to update billing information, please try again')
        });
    }
}

async function manageBilling({data, state, api}) {
    try {
        await api.member.manageBilling(data);
    } catch (e) {
        return buildActionError({
            action: 'manageBilling',
            state,
            message: t('Failed to open billing portal, please try again')
        });
    }
}

// ─── Newsletter / Email Actions ──────────────────────────────────────────────

async function updateNewsletterPreference({data, state, api}) {
    try {
        const {newsletters, enableCommentNotifications} = data;
        if (!newsletters && enableCommentNotifications === undefined) {
            return {};
        }

        const updateData = {
            ...(newsletters ? {newsletters} : {}),
            ...(enableCommentNotifications !== undefined ? {enableCommentNotifications} : {})
        };

        const member = await api.member.update(updateData);
        return {action: 'updateNewsletterPref:success', member};
    } catch (e) {
        return buildActionError({
            action: 'updateNewsletter',
            state,
            message: t('Failed to update newsletter settings'),
            autoHide: true
        });
    }
}

async function removeEmailFromSuppressionList({state, api}) {
    try {
        await api.member.deleteSuppression();
        return buildActionSuccess({
            action: 'removeEmailFromSuppressionList',
            state,
            message: t('You have been successfully resubscribed')
        });
    } catch (e) {
        return {
            action: 'removeEmailFromSuppressionList:failed',
            popupNotification: createErrorNotification({
                type: 'removeEmailFromSuppressionList:failed',
                state,
                message: t('Your email has failed to resubscribe, please try again'),
                autoHide: true
            })
        };
    }
}

async function updateNewsletter({data, state, api}) {
    try {
        const member = await api.member.update({subscribed: data.subscribed});
        if (!member) {
            throw new Error('Failed to update newsletter');
        }
        return buildActionSuccess({
            action: 'updateNewsletter',
            state,
            message: t('Email newsletter settings updated'),
            extra: {member}
        });
    } catch (e) {
        return {
            action: 'updateNewsletter:failed',
            popupNotification: createErrorNotification({
                type: 'updateNewsletter:failed',
                state,
                message: t('Failed to update newsletter settings'),
                autoHide: true
            })
        };
    }
}

// ─── Profile Update ──────────────────────────────────────────────────────────

async function updateMemberEmail({data, state, api}) {
    const {email} = data;
    if (email === getMemberEmail({member: state.member})) {
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
    const name = data?.name?.trim();
    if (name === getMemberName({member: state.member})) {
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
        const member = await api.member.sessionData();
        return member
            ? {member, success: true, action: 'refreshMemberData:success'}
            : null;
    } catch (err) {
        return {success: false, error: err, action: 'refreshMemberData:failed'};
    }
}

function buildProfileNotification({action, status, message, autoHide, state}) {
    return createPopupNotification({
        type: action, autoHide, closeable: true, status, state, message
    });
}

async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    const memberExtra = (update) => update?.