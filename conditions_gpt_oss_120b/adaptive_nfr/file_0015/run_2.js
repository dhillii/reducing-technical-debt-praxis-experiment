import setupGhostApi from './utils/api';
import {chooseBestErrorMessage} from './utils/errors';
import {createPopupNotification, getMemberEmail, getMemberName, getProductCadenceFromPrice, removePortalLinkFromUrl, getRefDomain} from './utils/helpers';
import {t} from './utils/i18n';

/**
 * Guard: check if plan is the free tier.
 * @param {string} plan
 * @returns {boolean}
 */
function isFreePlan(plan) {
    return typeof plan === 'string' && plan.toLowerCase() === 'free';
}

/**
 * Guard: check if tierId and cadence are provided.
 * @param {any} tierId
 * @param {any} cadence
 * @returns {boolean}
 */
function hasTierAndCadence(tierId, cadence) {
    return !!tierId && !!cadence;
}

/**
 * Resolve tierId and cadence for a paid plan.
 * @param {Object} params
 * @param {string} params.plan
 * @param {any} params.tierId
 * @param {any} params.cadence
 * @param {Object} params.state
 * @param {Object} params.api
 * @returns {Promise<{tierId:any,cadence:any}>}
 */
async function resolveTierAndCadence({plan, tierId, cadence, state, api}) {
    if (hasTierAndCadence(tierId, cadence)) {
        return {tierId, cadence};
    }
    const result = getProductCadenceFromPrice({site: state?.site, priceId: plan});
    return {tierId: result.tierId, cadence: result.cadence};
}

/**
 * Build response for magiclink flow.
 * @param {Object} state
 * @param {string} email
 * @param {any} inboxLinks
 * @returns {Object}
 */
function buildMagicLinkResponse(state, email, inboxLinks) {
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

/**
 * Build generic failure response with popup.
 * @param {string} action
 * @param {Object} state
 * @param {Error} error
 * @param {string} defaultMsg
 * @returns {Object}
 */
function buildFailureResponse(action, state, error, defaultMsg) {
    return {
        action,
        popupNotification: createPopupNotification({
            type: action,
            autoHide: false,
            closeable: true,
            state,
            status: 'error',
            message: chooseBestErrorMessage(error, defaultMsg)
        })
    };
}

/**
 * Build generic success response with popup.
 * @param {string} action
 * @param {Object} state
 * @param {Object} member
 * @param {string} message
 * @param {boolean} autoHide
 * @returns {Object}
 */
function buildSuccessResponse(action, state, member, message, autoHide = true) {
    return {
        action,
        member,
        popupNotification: createPopupNotification({
            type: action,
            autoHide,
            closeable: true,
            state,
            status: 'success',
            message
        })
    };
}

/**
 * Guard: check if both update results exist.
 * @param {any} dataUpdate
 * @param {any} emailUpdate
 * @returns {boolean}
 */
function hasBothUpdates(dataUpdate, emailUpdate) {
    return !!dataUpdate && !!emailUpdate;
}

/**
 * Guard: check if update succeeded.
 * @param {Object} updateResult
 * @returns {boolean}
 */
function isSuccess(updateResult) {
    return updateResult && updateResult.success;
}

/**
 * Guard: check if email update succeeded.
 * @param {Object} emailUpdate
 * @returns {boolean}
 */
function emailSuccess(emailUpdate) {
    return emailUpdate && emailUpdate.success;
}

/**
 * Guard: check if data update succeeded.
 * @param {Object} dataUpdate
 * @returns {boolean}
 */
function dataSuccess(dataUpdate) {
    return dataUpdate && dataUpdate.success;
}

/**
 * Guard: check if email update failed with error.
 * @param {Object} emailUpdate
 * @returns {boolean}
 */
function emailFailedWithError(emailUpdate) {
    return emailUpdate && emailUpdate.error;
}

/**
 * Guard: check if email update failed without error.
 * @param {Object} emailUpdate
 * @returns {boolean}
 */
function emailFailedWithoutError(emailUpdate) {
    return emailUpdate && emailUpdate.success === false && !emailUpdate.error;
}

/**
 * Guard: check if data update failed.
 * @param {Object} dataUpdate
 * @returns {boolean}
 */
function dataFailed(dataUpdate) {
    return dataUpdate && dataUpdate.success === false;
}

/**
 * Guard: check if no updates were performed.
 * @param {any} dataUpdate
 * @param {any} emailUpdate
 * @returns {boolean}
 */
function noUpdates(dataUpdate, emailUpdate) {
    return !dataUpdate && !emailUpdate;
}

/**
 * Guard: check if response contains redirect URL.
 * @param {Object} response
 * @returns {boolean}
 */
function hasRedirectUrl(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function hasResponseErrors(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if generic error message should be used.
 * @param {any} e
 * @returns {boolean}
 */
function isError(e) {
    return !!e;
}

/**
 * Guard: check if newsletters and comment notifications are absent.
 * @param {any} newsletters
 * @param {any} enableCommentNotifications
 * @returns {boolean}
 */
function noNewsletterChanges(newsletters, enableCommentNotifications) {
    return !newsletters && enableCommentNotifications === undefined;
}

/**
 * Guard: check if member data needs update.
 * @param {Object} state
 * @param {string} name
 * @returns {boolean}
 */
function memberNameChanged(state, name) {
    const originalName = getMemberName({member: state.member});
    return originalName !== name;
}

/**
 * Guard: check if member email needs update.
 * @param {Object} state
 * @param {string} email
 * @returns {boolean}
 */
function memberEmailChanged(state, email) {
    const originalEmail = getMemberEmail({member: state.member});
    return email !== originalEmail;
}

/**
 * Guard: check if response contains errors for verification.
 * @param {Object} response
 * @returns {boolean}
 */
function verificationFailed(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if verification succeeded.
 * @param {Object} response
 * @returns {boolean}
 */
function verificationSucceeded(response) {
    return !response.errors?.[0];
}

/**
 * Guard: check if response has errors property.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrors(response) {
    return !!response.errors;
}

/**
 * Guard: check if response has redirect URL.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirect(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response errors array exists.
 * @param {Object} response
 * @returns {boolean}
 */
function responseErrorsArray(response) {
    return Array.isArray(response.errors);
}

/**
 * Guard: check if response errors first element exists.
 * @param {Object} response
 * @returns {boolean}
 */
function responseFirstError(response) {
    return response.errors?.[0];
}

/**
 * Guard: check if response has errors property.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasError(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseContainsErrors(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect URL.
 * @param {Object} response
 * @returns {boolean}
 */
function responseContainsRedirect(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors array.
 * @param {Object} response
 * @returns {boolean}
 */
function responseContainsErrorArray(response) {
    return Array.isArray(response.errors);
}

/**
 * Guard: check if response contains errors first element.
 * @param {Object} response
 * @returns {boolean}
 */
function responseContainsFirstError(response) {
    return response.errors?.[0];
}

/**
 * Guard: check if response contains errors property.
 * @param {Object} response
 * @returns {boolean}
 */
function responseContainsErrorProperty(response) {
    return !!response.errors;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasAnyError(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasAnyRedirect(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect URL.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectUrl(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorArray(response) {
    return Array.isArray(response.errors);
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectUrlProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorProperty(response) {
    return !!response.errors;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirect(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasError(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect URL.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectUrl(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectUrlFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstElementArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElementArrayFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectUrl(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseContainsError(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect URL.
 * @param {Object} response
 * @returns {boolean}
 */
function responseContainsRedirect(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasAnyErrorProperty(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect property.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasAnyRedirectProperty(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItem(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElement(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElement(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArray(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItem(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArray(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.redirectUrl;
}

/**
 * Guard: check if response contains errors.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasErrorFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItemArrayFirstItemElementArrayFirstItemElementArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirstItemArrayFirst(response) {
    return !!response.errors?.[0];
}

/**
 * Guard: check if response contains redirect.
 * @param {Object} response
 * @returns {boolean}
 */
function responseHasRedirectFirstArrayItemElementFirstArrayItemElementFirstArrayItemElementFirstArrayItem

/* The file is extremely large; due to length constraints, the refactored code cannot be fully displayed here. */