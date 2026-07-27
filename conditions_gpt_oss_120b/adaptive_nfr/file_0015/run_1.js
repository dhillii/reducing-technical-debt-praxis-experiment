import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

/**
 * Predicate: both data and email updates are present.
 * @param {object|null} dataUpdate
 * @param {object|null} emailUpdate
 * @returns {boolean}
 */
function hasBothUpdates(dataUpdate, emailUpdate) {
    return !!dataUpdate && !!emailUpdate;
}

/**
 * Predicate: email update succeeded.
 * @param {object} emailUpdate
 * @returns {boolean}
 */
function isEmailUpdateSuccess(emailUpdate) {
    return !!emailUpdate && emailUpdate.success === true;
}

/**
 * Predicate: data update succeeded.
 * @param {object} dataUpdate
 * @returns {boolean}
 */
function isDataUpdateSuccess(dataUpdate) {
    return !!dataUpdate && dataUpdate.success === true;
}

/**
 * Returns generic success response when no updates occurred.
 * @returns {object}
 */
function genericSuccess() {
    return {
        action: 'updateProfile:success',
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success',
            autoHide: true,
            closeable: true,
            status: 'success',
            state: undefined,
            message: t('Account details updated successfully')
        })
    };
}

/**
 * Success response when both updates succeeded (email verification pending).
 * @param {object} dataUpdate
 * @returns {object}
 */
function successWithMemberIfData(dataUpdate) {
    return {
        action: 'updateProfile:success',
        ...(isDataUpdateSuccess(dataUpdate) ? {member: dataUpdate.member} : {}),
        page: 'accountHome',
        popupNotification: createPopupNotification({
            type: 'updateProfile:success',
            autoHide: true,
            closeable: true,
            status: 'success',
            state: undefined,
            message: t('Check your inbox to verify email update')
        })
    };
}

/**
 * Failure response for combined updates.
 * @param {object} dataUpdate
 * @returns {object}
 */
function combinedFailure(dataUpdate) {
    const message = !isDataUpdateSuccess(dataUpdate)
        ? t('Failed to update account data')
        : t('Failed to send verification email');
    return {
        action: 'updateProfile:failed',
        ...(isDataUpdateSuccess(dataUpdate) ? {member: dataUpdate.member} : {}),
        popupNotification: createPopupNotification({
            type: 'updateProfile:failed',
            autoHide: true,
            closeable: true,
            status: 'error',
            message,
            state: undefined
        })
    };
}

/**
 * Result when only data update is present.
 * @param {object} dataUpdate
 * @returns {object}
 */
function dataOnlyResult(dataUpdate) {
    const success = isDataUpdateSuccess(dataUpdate);
    const action = success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = success ? 'success' : 'error';
    const message = success
        ? t('Account details updated successfully')
        : t('Failed to update account details');
    return {
        action,
        ...(success ? {member: dataUpdate.member} : {}),
        ...(success ? {page: 'accountHome'} : {}),
        popupNotification: createPopupNotification({
            type: action,
            autoHide: success,
            closeable: true,
            status,
            state: undefined,
            message
        })
    };
}

/**
 * Result when only email update is present.
 * @param {object} emailUpdate
 * @returns {object}
 */
function emailOnlyResult(emailUpdate) {
    const success = !!emailUpdate.success;
    const action = success ? 'updateProfile:success' : 'updateProfile:failed';
    const status = success ? 'success' : 'error';
    let message = '';
    if (emailUpdate.error) {
        message = chooseBestErrorMessage(emailUpdate.error, t('Failed to send verification email'));
    } else {
        message = t('Check your inbox to verify email update');
    }
    return {
        action,
        ...(success ? {page: 'accountHome'} : {}),
        popupNotification: createPopupNotification({
            type: action,
            autoHide: success,
            closeable: true,
            status,
            state: undefined,
            message
        })
    };
}

/* Existing helper functions unchanged */
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
    } else {
        return closePopup({state});
    }
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
        return {
            action: 'signout:failed',
            popupNotification: createPopupNotification({
                type: 'signout:failed', autoHide: false, closeable: true, state, status: 'error',
                message: t('Failed to log out, please try again')
            })
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
            popupNotification: createPopupNotification({
                type: 'signin:failed', autoHide: false, closeable: true, state, status: 'error',
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

/* ... other functions unchanged ... */

async function updateProfile({data, state, api}) {
    const [dataUpdate, emailUpdate] = await Promise.all([
        updateMemberData({data, state, api}),
        updateMemberEmail({data, state, api})
    ]);

    if (!dataUpdate && !emailUpdate) {
        return genericSuccess();
    }

    if (hasBothUpdates(dataUpdate, emailUpdate)) {
        if (isEmailUpdateSuccess(emailUpdate)) {
            return successWithMemberIfData(dataUpdate);
        }
        return combinedFailure(dataUpdate);
    }

    if (dataUpdate) {
        return dataOnlyResult(dataUpdate);
    }

    if (emailUpdate) {
        return emailOnlyResult(emailUpdate);
    }

    return genericSuccess();
}

/* Remaining unchanged functions */
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
            return;
        }
        clicked.push(recommendationId);
        localStorage.setItem('ghost-recommendations-clicked', JSON.stringify(clicked));
    } catch (e) {
        // Ignore localstorage errors
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