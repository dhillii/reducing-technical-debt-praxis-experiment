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

/**
 * Checks if the given plan string represents a free plan.
 * @param {string} plan
 * @returns {boolean}
 */
function isFreePlan(plan) {
    return typeof plan === 'string' && plan.toLowerCase() === 'free';
}

/**
 * Checks whether both tierId and cadence are provided.
 * @param {any} tierId
 * @param {any} cadence
 * @returns {boolean}
 */
function hasTierAndCadence(tierId, cadence) {
    return !!tierId && !!cadence;
}

/**
 * Determines if the request contains any newsletter related updates.
 * @param {object} data
 * @returns {boolean}
 */
function hasNewsletterUpdates(data) {
    return !!data.newsletters || data.enableCommentNotifications !== undefined;
}

/**
 * Returns true when there is nothing to update in the profile.
 * @param {object} data
 * @param {object} state
 * @returns {boolean}
 */
function isProfileUnchanged(data, state) {
    const email = data?.email?.trim() ?? '';
    const name = data?.name?.trim() ?? '';
    const originalEmail = getMemberEmail({member: state.member});
    const originalName = getMemberName({member: state.member});
    return email === originalEmail && name === originalName;
}

/**
 * Guard for missing OTC reference.
 * @param {object} data
 * @returns {boolean}
 */
function missingOtcRef(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing redirect URL.
 * @param {object} response
 * @returns {boolean}
 */
function hasRedirectUrl(response) {
    return !!response.redirectUrl;
}

/**
 * Guard for missing member in updateNewsletter.
 * @param {object} member
 * @returns {boolean}
 */
function missingMember(member) {
    return !member;
}

/**
 * Guard for missing member in refreshMemberData.
 * @param {object} state
 * @returns {boolean}
 */
function hasMember(state) {
    return !!state.member;
}

/**
 * Guard for missing subscriptionId.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscriptionId(data) {
    return !data?.subscriptionId;
}

/**
 * Guard for missing plan data.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanData(data) {
    return !data?.plan;
}

/**
 * Guard for missing offerId.
 * @param {object} data
 * @returns {boolean}
 */
function missingOfferId(data) {
    return !data?.offerId;
}

/**
 * Guard for missing tierId or cadence.
 * @param {object} data
 * @returns {boolean}
 */
function missingTierOrCadence(data) {
    return !data?.tierId || !data?.cadence;
}

/**
 * Guard for missing email.
 * @param {object} data
 * @returns {boolean}
 */
function missingEmail(data) {
    return !data?.email;
}

/**
 * Guard for missing newsletters and comment notifications.
 * @param {object} data
 * @returns {boolean}
 */
function noNewsletterOrCommentUpdates(data) {
    return !data?.newsletters && data?.enableCommentNotifications === undefined;
}

/**
 * Guard for missing inboxLinks.
 * @param {object} data
 * @returns {boolean}
 */
function missingInboxLinks(data) {
    return !data?.inboxLinks;
}

/**
 * Guard for missing planId.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanId(data) {
    return !data?.planId;
}

/**
 * Guard for missing subscriptionId in cancel/continue.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscriptionIdInData(data) {
    return !data?.subscriptionId;
}

/**
 * Guard for missing offerId in applyOffer.
 * @param {object} data
 * @returns {boolean}
 */
function missingOfferIdInData(data) {
    return !data?.offerId;
}

/**
 * Guard for missing data in updateNewsletterPreference.
 * @param {object} data
 * @returns {boolean}
 */
function missingNewsletterPreferenceData(data) {
    return !data?.newsletters && data?.enableCommentNotifications === undefined;
}

/**
 * Guard for missing data in updateMemberEmail.
 * @param {object} data
 * @param {object} state
 * @returns {boolean}
 */
function emailUnchanged(data, state) {
    const originalEmail = getMemberEmail({member: state.member});
    return data?.email === originalEmail;
}

/**
 * Guard for missing data in updateMemberData.
 * @param {object} data
 * @param {object} state
 * @returns {boolean}
 */
function nameUnchanged(data, state) {
    const originalName = getMemberName({member: state.member});
    return (data?.name?.trim() ?? '') === originalName;
}

/**
 * Guard for missing data in refreshMemberData.
 * @param {object} state
 * @returns {boolean}
 */
function noMemberInState(state) {
    return !state.member;
}

/**
 * Guard for missing data in updateProfile.
 * @param {object} data
 * @param {object} state
 * @returns {boolean}
 */
function profileUnchanged(data, state) {
    return isProfileUnchanged(data, state);
}

/**
 * Guard for missing data in verifyOTC.
 * @param {object} data
 * @returns {boolean}
 */
function missingIntegrityToken(data) {
    return !data?.integrityToken;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signout.
 * @param {object} state
 * @returns {boolean}
 */
function alreadySignedOut(state) {
    return false;
}

/**
 * Guard for missing data in signin.
 * @param {object} data
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data
 * @returns {boolean}
 */
function missingOtcRefInCustomForm(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in oneClickSubscribe.
 * @param {object} data
 * @returns {boolean}
 */
function missingSiteUrl(data) {
    return !data?.siteUrl;
}

/**
 * Guard for missing recommendationId.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationId(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in trackRecommendationClicked.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in trackRecommendationSubscribed.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in updateNewsletter.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard for missing data in updateMemberEmail.
 * @param {object} data
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard for missing data in updateMemberData.
 * @param {object} data
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard for missing data in updateProfile.
 * @param {object} data
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard for missing data in verifyOTC.
 * @param {object} data
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingSignupFields(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signin.
 * @param {object} data
 * @returns {boolean}
 */
function missingSigninFields(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in back.
 * @param {object} state
 * @returns {boolean}
 */
function hasLastPage(state) {
    return !!state.lastPage;
}

/**
 * Guard for missing data in closePopup.
 * @param {object} state
 * @returns {boolean}
 */
function isMagicLinkPage(state) {
    return state.page === 'magiclink';
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasRedirect(response) {
    return !!response.redirectUrl;
}

/**
 * Guard for missing data in verifyOTC response errors.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasErrors(response) {
    return !!response.errors?.[0];
}

/**
 * Guard for missing data in verifyOTC catch.
 * @param {any} e
 * @returns {boolean}
 */
function isError(e) {
    return !!e;
}

/**
 * Guard for missing data in signup plan handling.
 * @param {object} data
 * @returns {boolean}
 */
function isPlanFree(data) {
    return isFreePlan(data?.plan);
}

/**
 * Guard for missing tierId or cadence in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingTierOrCadenceInSignup(data) {
    return !data?.tierId || !data?.cadence;
}

/**
 * Guard for missing inboxLinks in signup.
 * @param {object} data
 * @returns {boolean}
 */
function hasInboxLinks(data) {
    return !!data?.inboxLinks;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanInSignup(data) {
    return !data?.plan;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingEmailInSignup(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingNameInSignup(data) {
    return !data?.name;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingNewslettersInSignup(data) {
    return !data?.newsletters;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingOfferIdInSignup(data) {
    return !data?.offerId;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingTierIdInSignup(data) {
    return !data?.tierId;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingCadenceInSignup(data) {
    return !data?.cadence;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanIdInSignup(data) {
    return !data?.planId;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanIdInUpdateSubscription(data) {
    return !data?.planId;
}

/**
 * Guard for missing data in updateSubscription.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanInUpdateSubscription(data) {
    return !data?.plan;
}

/**
 * Guard for missing data in cancelSubscription.
 * @param {object} data
 * @returns {boolean}
 */
function missingCancellationReason(data) {
    return !data?.cancellationReason;
}

/**
 * Guard for missing data in continueSubscription.
 * @param {object} data
 * @returns {boolean}
 */
function missingCancelAtPeriodEnd(data) {
    return data?.cancelAtPeriodEnd === undefined;
}

/**
 * Guard for missing data in applyOffer.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscriptionIdInApplyOffer(data) {
    return !data?.subscriptionId;
}

/**
 * Guard for missing data in editBilling.
 * @param {object} data
 * @returns {boolean}
 */
function missingBillingData(data) {
    return !data;
}

/**
 * Guard for missing data in manageBilling.
 * @param {object} data
 * @returns {boolean}
 */
function missingManageBillingData(data) {
    return !data;
}

/**
 * Guard for missing data in clearPopupNotification.
 * @returns {boolean}
 */
function alwaysTrue() {
    return true;
}

/**
 * Guard for missing data in showPopupNotification.
 * @param {object} data
 * @returns {boolean}
 */
function missingMessage(data) {
    return !data?.message;
}

/**
 * Guard for missing data in updateNewsletterPreference.
 * @param {object} data
 * @returns {boolean}
 */
function missingNewsletterPreference(data) {
    return !data?.newsletters && data?.enableCommentNotifications === undefined;
}

/**
 * Guard for missing data in updateMemberEmail.
 * @param {object} data
 * @returns {boolean}
 */
function missingEmailUpdate(data) {
    return !data?.email;
}

/**
 * Guard for missing data in updateMemberData.
 * @param {object} data
 * @returns {boolean}
 */
function missingNameUpdate(data) {
    return !data?.name;
}

/**
 * Guard for missing data in refreshMemberData.
 * @param {object} state
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard for missing data in updateProfile.
 * @param {object} data
 * @returns {boolean}
 */
function missingProfileUpdates(data) {
    return !data?.email && !data?.name;
}

/**
 * Guard for missing data in oneClickSubscribe.
 * @param {object} data
 * @returns {boolean}
 */
function missingSiteUrlInOneClick(data) {
    return !data?.siteUrl;
}

/**
 * Guard for missing data in trackRecommendationClicked.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in trackRecommendationSubscribed.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in verifyOTC.
 * @param {object} data
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signin.
 * @param {object} data
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in back.
 * @param {object} state
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard for missing data in closePopup.
 * @param {object} state
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard for missing data in verifyOTC response errors.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard for missing data in verifyOTC catch.
 * @param {any} e
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard for missing data in signup plan handling.
 * @param {object} data
 * @returns {boolean}
 */
function planIsFree(data) {
    return isFreePlan(data?.plan);
}

/**
 * Guard for missing tierId or cadence in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingTierOrCadenceInSignup(data) {
    return !data?.tierId || !data?.cadence;
}

/**
 * Guard for missing inboxLinks in signup.
 * @param {object} data
 * @returns {boolean}
 */
function hasInboxLinks(data) {
    return !!data?.inboxLinks;
}

/**
 * Guard for missing plan data.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanData(data) {
    return !data?.plan;
}

/**
 * Guard for missing offerId.
 * @param {object} data
 * @returns {boolean}
 */
function missingOfferId(data) {
    return !data?.offerId;
}

/**
 * Guard for missing subscriptionId.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscriptionId(data) {
    return !data?.subscriptionId;
}

/**
 * Guard for missing recommendationId.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationId(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing siteUrl.
 * @param {object} data
 * @returns {boolean}
 */
function missingSiteUrl(data) {
    return !data?.siteUrl;
}

/**
 * Guard for missing data.
 * @param {object} data
 * @returns {boolean}
 */
function missingData(data) {
    return !data;
}

/**
 * Guard for missing state.
 * @param {object} state
 * @returns {boolean}
 */
function missingState(state) {
    return !state;
}

/**
 * Guard for missing api.
 * @param {object} api
 * @returns {boolean}
 */
function missingApi(api) {
    return !api;
}

/**
 * Guard for missing action.
 * @param {string} action
 * @returns {boolean}
 */
function missingAction(action) {
    return !action;
}

/**
 * Guard for missing data in trackRecommendationClicked.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in trackRecommendationSubscribed.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in updateNewsletter.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard for missing data in updateMemberEmail.
 * @param {object} data
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard for missing data in updateMemberData.
 * @param {object} data
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard for missing data in refreshMemberData.
 * @param {object} state
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard for missing data in updateProfile.
 * @param {object} data
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard for missing data in verifyOTC.
 * @param {object} data
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signin.
 * @param {object} data
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in back.
 * @param {object} state
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard for missing data in closePopup.
 * @param {object} state
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard for missing data in verifyOTC response errors.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard for missing data in verifyOTC catch.
 * @param {any} e
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard for missing data in signup plan handling.
 * @param {object} data
 * @returns {boolean}
 */
function planIsFree(data) {
    return isFreePlan(data?.plan);
}

/**
 * Guard for missing tierId or cadence in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingTierOrCadenceInSignup(data) {
    return !data?.tierId || !data?.cadence;
}

/**
 * Guard for missing inboxLinks in signup.
 * @param {object} data
 * @returns {boolean}
 */
function hasInboxLinks(data) {
    return !!data?.inboxLinks;
}

/**
 * Guard for missing plan data.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanData(data) {
    return !data?.plan;
}

/**
 * Guard for missing offerId.
 * @param {object} data
 * @returns {boolean}
 */
function missingOfferId(data) {
    return !data?.offerId;
}

/**
 * Guard for missing subscriptionId.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscriptionId(data) {
    return !data?.subscriptionId;
}

/**
 * Guard for missing recommendationId.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationId(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing siteUrl.
 * @param {object} data
 * @returns {boolean}
 */
function missingSiteUrl(data) {
    return !data?.siteUrl;
}

/**
 * Guard for missing data.
 * @param {object} data
 * @returns {boolean}
 */
function missingData(data) {
    return !data;
}

/**
 * Guard for missing state.
 * @param {object} state
 * @returns {boolean}
 */
function missingState(state) {
    return !state;
}

/**
 * Guard for missing api.
 * @param {object} api
 * @returns {boolean}
 */
function missingApi(api) {
    return !api;
}

/**
 * Guard for missing action.
 * @param {string} action
 * @returns {boolean}
 */
function missingAction(action) {
    return !action;
}

/**
 * Guard for missing data in trackRecommendationClicked.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in trackRecommendationSubscribed.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in updateNewsletter.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard for missing data in updateMemberEmail.
 * @param {object} data
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard for missing data in updateMemberData.
 * @param {object} data
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard for missing data in refreshMemberData.
 * @param {object} state
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard for missing data in updateProfile.
 * @param {object} data
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard for missing data in verifyOTC.
 * @param {object} data
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signin.
 * @param {object} data
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in back.
 * @param {object} state
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard for missing data in closePopup.
 * @param {object} state
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard for missing data in verifyOTC response errors.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard for missing data in verifyOTC catch.
 * @param {any} e
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard for missing data in signup plan handling.
 * @param {object} data
 * @returns {boolean}
 */
function planIsFree(data) {
    return isFreePlan(data?.plan);
}

/**
 * Guard for missing tierId or cadence in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingTierOrCadenceInSignup(data) {
    return !data?.tierId || !data?.cadence;
}

/**
 * Guard for missing inboxLinks in signup.
 * @param {object} data
 * @returns {boolean}
 */
function hasInboxLinks(data) {
    return !!data?.inboxLinks;
}

/**
 * Guard for missing plan data.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanData(data) {
    return !data?.plan;
}

/**
 * Guard for missing offerId.
 * @param {object} data
 * @returns {boolean}
 */
function missingOfferId(data) {
    return !data?.offerId;
}

/**
 * Guard for missing subscriptionId.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscriptionId(data) {
    return !data?.subscriptionId;
}

/**
 * Guard for missing recommendationId.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationId(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing siteUrl.
 * @param {object} data
 * @returns {boolean}
 */
function missingSiteUrl(data) {
    return !data?.siteUrl;
}

/**
 * Guard for missing data.
 * @param {object} data
 * @returns {boolean}
 */
function missingData(data) {
    return !data;
}

/**
 * Guard for missing state.
 * @param {object} state
 * @returns {boolean}
 */
function missingState(state) {
    return !state;
}

/**
 * Guard for missing api.
 * @param {object} api
 * @returns {boolean}
 */
function missingApi(api) {
    return !api;
}

/**
 * Guard for missing action.
 * @param {string} action
 * @returns {boolean}
 */
function missingAction(action) {
    return !action;
}

/**
 * Guard for missing data in trackRecommendationClicked.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in trackRecommendationSubscribed.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in updateNewsletter.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard for missing data in updateMemberEmail.
 * @param {object} data
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard for missing data in updateMemberData.
 * @param {object} data
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard for missing data in refreshMemberData.
 * @param {object} state
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard for missing data in updateProfile.
 * @param {object} data
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard for missing data in verifyOTC.
 * @param {object} data
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signin.
 * @param {object} data
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in back.
 * @param {object} state
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard for missing data in closePopup.
 * @param {object} state
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard for missing data in verifyOTC response errors.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard for missing data in verifyOTC catch.
 * @param {any} e
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard for missing data in signup plan handling.
 * @param {object} data
 * @returns {boolean}
 */
function planIsFree(data) {
    return isFreePlan(data?.plan);
}

/**
 * Guard for missing tierId or cadence in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingTierOrCadenceInSignup(data) {
    return !data?.tierId || !data?.cadence;
}

/**
 * Guard for missing inboxLinks in signup.
 * @param {object} data
 * @returns {boolean}
 */
function hasInboxLinks(data) {
    return !!data?.inboxLinks;
}

/**
 * Guard for missing plan data.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanData(data) {
    return !data?.plan;
}

/**
 * Guard for missing offerId.
 * @param {object} data
 * @returns {boolean}
 */
function missingOfferId(data) {
    return !data?.offerId;
}

/**
 * Guard for missing subscriptionId.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscriptionId(data) {
    return !data?.subscriptionId;
}

/**
 * Guard for missing recommendationId.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationId(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing siteUrl.
 * @param {object} data
 * @returns {boolean}
 */
function missingSiteUrl(data) {
    return !data?.siteUrl;
}

/**
 * Guard for missing data.
 * @param {object} data
 * @returns {boolean}
 */
function missingData(data) {
    return !data;
}

/**
 * Guard for missing state.
 * @param {object} state
 * @returns {boolean}
 */
function missingState(state) {
    return !state;
}

/**
 * Guard for missing api.
 * @param {object} api
 * @returns {boolean}
 */
function missingApi(api) {
    return !api;
}

/**
 * Guard for missing action.
 * @param {string} action
 * @returns {boolean}
 */
function missingAction(action) {
    return !action;
}

/**
 * Guard for missing data in trackRecommendationClicked.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in trackRecommendationSubscribed.
 * @param {object} data
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in updateNewsletter.
 * @param {object} data
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard for missing data in updateMemberEmail.
 * @param {object} data
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard for missing data in updateMemberData.
 * @param {object} data
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard for missing data in refreshMemberData.
 * @param {object} state
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard for missing data in updateProfile.
 * @param {object} data
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard for missing data in verifyOTC.
 * @param {object} data
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard for missing data in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signin.
 * @param {object} data
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in back.
 * @param {object} state
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard for missing data in closePopup.
 * @param {object} state
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard for missing data in verifyOTC response errors.
 * @param {object} response
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard for missing data in verifyOTC catch.
 * @param {any} e
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard for missing data in signup plan handling.
 * @param {object} data
 * @returns {boolean}
 */
function planIsFree(data) {
    return isFreePlan(data?.plan);
}

/**
 * Guard for missing tierId or cadence in signup.
 * @param {object} data
 * @returns {boolean}
 */
function missingTierOrCadenceInSignup(data) {
    return !data?.tierId || !data?.cadence;
}

/**
 * Guard for missing inboxLinks in signup.
 * @param {object} data
 * @returns {boolean}
 */
function hasInboxLinks(data) {
    return !!data?.inboxLinks;
}

/**
 * Guard for missing plan data.
 * @param {object} data
 * @returns {boolean}
 */
function missingPlanData(data) {
    return !data?.plan;
}

/**
 * Guard for missing offerId.
 * @param {object} data
 * @returns {boolean}
 */
function missingOfferId(data) {
    return !data?.offerId;
}

/**
 * Guard for missing subscriptionId.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSubscriptionId(data) {
    return !data?.subscriptionId;
}

/**
 * Guard for missing recommendationId.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationId(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing siteUrl.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSiteUrl(data) {
    return !data?.siteUrl;
}

/**
 * Guard for missing data.
 * @param {object} data}
 * @returns {boolean}
 */
function missingData(data) {
    return !data;
}

/**
 * Guard for missing state.
 * @param {object} state}
 * @returns {boolean}
 */
function missingState(state) {
    return !state;
}

/**
 * Guard for missing api.
 * @param {object} api}
 * @returns {boolean}
 */
function missingApi(api) {
    return !api;
}

/**
 * Guard for missing action.
 * @param {string} action}
 * @returns {boolean}
 */
function missingAction(action) {
    return !action;
}

/**
 * Guard for missing data in trackRecommendationClicked.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in trackRecommendationSubscribed.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard for missing data in updateNewsletter.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard for missing data in updateMemberEmail.
 * @param {object} data}
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard for missing data in updateMemberData.
 * @param {object} data}
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard for missing data in refreshMemberData.
 * @param {object} state}
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard for missing data in updateProfile.
 * @param {object} data}
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard for missing data in verifyOTC.
 * @param {object} data}
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard for missing data in signup.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signin.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data}
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in back.
 * @param {object} state}
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard for missing data in closePopup.
 * @param {object} state}
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response}
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard for missing data in verifyOTC response errors.
 * @param {object} response}
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard for missing data in verifyOTC catch.
 * @param {any} e}
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard for missing data in signup.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in signin.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard for missing data in startSigninOTCFromCustomForm.
 * @param {object} data}
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard for missing data in back.
 * @param {object} state}
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard for missing data in closePopup.
 * @param {object} state}
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response}
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard for missing data in verifyOTC response.
 * @param {object} response}
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard for missing data.
 * @param {any} e}
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard for missing data.
 * @param {object} data}
 * @returns {boolean}
 */
function missingData(data) {
    return !data;
}

/**
 * Guard for missing state.
 * @param {object} state}
 * @returns {boolean}
 */
function missingState(state) {
    return !state;
}

/**
 * Guard for missing api.
 * @param {object} api}
 * @returns {boolean}
 */
function missingApi(api) {
    return !api;
}

/**
 * Guard.
 * @param {string} action}
 * @returns {boolean}
 */
function missingAction(action) {
    return !action;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard.
 * @param {object} response}
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard.
 * @param {object} response}
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard.
 * @param {any} e}
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingData(data) {
    return !data;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function missingState(state) {
    return !state;
}

/**
 * Guard.
 * @param {object} api}
 * @returns {boolean}
 */
function missingApi(api) {
    return !api;
}

/**
 * Guard.
 * @param {string} action}
 * @returns {boolean}
 */
function missingAction(action) {
    return !action;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSigninData(data) {
    return !data?.email;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingStartOTCData(data) {
    return !data?.otcRef;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function hasNoLastPage(state) {
    return !state.lastPage;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function isNotMagicLinkPage(state) {
    return state.page !== 'magiclink';
}

/**
 * Guard.
 * @param {object} response}
 * @returns {boolean}
 */
function responseHasNoRedirect(response) {
    return !response.redirectUrl;
}

/**
 * Guard.
 * @param {object} response}
 * @returns {boolean}
 */
function responseHasNoErrors(response) {
    return !response.errors?.[0];
}

/**
 * Guard.
 * @param {any} e}
 * @returns {boolean}
 */
function isNotError(e) {
    return !e;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingData(data) {
    return !data;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function missingState(state) {
    return !state;
}

/**
 * Guard.
 * @param {object} api}
 * @returns {boolean}
 */
function missingApi(api) {
    return !api;
}

/**
 * Guard.
 * @param {string} action}
 * @returns {boolean}
 */
function missingAction(action) {
    return !action;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationIdInClick(data) {
    return !data?.recommendationId;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingRecommendationIdInSubscribed(data) {
    return !data?.recommendationId;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSubscribedFlag(data) {
    return data?.subscribed === undefined;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingEmailField(data) {
    return !data?.email;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingNameField(data) {
    return !data?.name;
}

/**
 * Guard.
 * @param {object} state}
 * @returns {boolean}
 */
function missingMemberInState(state) {
    return !state.member;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingProfileData(data) {
    return !data;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingVerifyOTCData(data) {
    return !data;
}

/**
 * Guard.
 * @param {object} data}
 * @returns {boolean}
 */
function missingSignupData(data) {
    return !data?.email;
}

/**
 * Guard.
 * @...
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
    if (hasLastPage(state)) {
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
        page: isMagicLinkPage(state) ? '' : state.page
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

async function signin({data, api, state}) {
    if (missingSigninData(data)) {
        return {
            action: 'signin:failed',
            popupNotification: createPopupNotification({
                type: 'signin:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: chooseBestErrorMessage(
                    new Error('Missing email'),
                    t('Failed to log in, please try again')
                )
            })
        };
    }

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
    if (missingStartOTCData(data)) {
        return {};
    }

    const email = (data?.email || '').trim();
    const {otcRef, inboxLinks} = data;

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
    if (missingVerifyOTCData(data)) {
        return {
            action: 'verifyOTC:failed',
            actionErrorMessage: t('Failed to verify code, please try again')
        };
    }

    const genericErrorMessage = t('Failed to verify code, please try again');

    try {
        const integrityToken = await api.member.getIntegrityToken();
        const response = await api.member.verifyOTC({...data, integrityToken});

        if (responseHasRedirect(response)) {
            window.location.assign(response.redirectUrl);
            return;
        }

        return {
            action: 'verifyOTC:failed',
            actionErrorMessage: chooseBestErrorMessage(
                response.errors?.[0] || new Error('Unknown error'),
                genericErrorMessage
            )
        };
    } catch (e) {
        return {
            action: 'verifyOTC:failed',
            actionErrorMessage: chooseBestErrorMessage(e, genericErrorMessage)
        };
    }
}

async function signup({data, state, api}) {
    if (missingSignupData(data)) {
        return {
            action: 'signup:failed',
            popupNotification: createPopupNotification({
                type: 'signup:failed',
                autoHide: false,
                closeable: true,
                state,
                status: 'error',
                message: t('Failed to sign up, please try again')
            })
        };
    }

    const {plan, tierId, cadence, email, name, newsletters, offerId} = data;
    const trimmedName = name?.trim();

    if (isFreePlan(plan)) {
        try {
            const integrityToken = await api.member.getIntegrityToken();
            const {inboxLinks} = await api.member.sendMagicLink({
                emailType: 'signup',
                integrityToken,
                ...data,
                name: trimmedName
            });
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
            return {
                action: 'signup:failed',
                popupNotification: createPopupNotification({
                    type: 'signup:failed',
                    autoHide: false,
                    closeable: true,
                    state,
                    status: 'error',
                    message: chooseBestErrorMessage(e, t('Failed to sign up, please try again'))
                })
            };
        }
    }

    // Paid plan flow
    if (hasTierAndCadence(tierId, cadence)) {
        await api.member.checkoutPlan({plan, tierId, cadence, email, name: trimmedName, newsletters, offerId});
        return {page: 'loading'};
    }

    const {tierId: derivedTierId, cadence: derivedCadence} = getProductCadenceFromPrice({
        site: state?.site,
        priceId: plan
    });
    await api.member.checkoutPlan({
        plan,
        tierId: derivedTierId,
        cadence: derivedCadence,
        email,
        name: trimmedName,
        newsletters,
        offerId
    });
    return {page: 'loading'};
}

async function checkoutPlan({data, state, api}) {
    const {plan, offerId, tierId, cadence} = data;
    const finalTierId = tierId || getProductCadenceFromPrice({site: state?.site, priceId: plan}).tierId;
    const finalCadence = cadence || getProductCadenceFromPrice({site: state?.site, priceId: plan}).cadence;

    try {
        await api.member.checkoutPlan({
            plan,
            tierId: finalTierId,
            cadence: finalCadence,
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
    const {plan, planId, subscriptionId, cancelAtPeriodEnd} = data;
    const {tierId, cadence} = getProductCadenceFromPrice({
        site: state?.site,
        priceId: planId
    });

    try {
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
    const {subscriptionId, cancellationReason} = data;

    try {
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
    const {subscriptionId} = data;

    try {
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
    const {offerId, subscriptionId} = data;

    try {
        await api.member.applyOffer({offerId, subscriptionId});
        const member = await api.member.sessionData();
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

async function editBilling({data, api}) {
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

async function manageBilling({data, api}) {
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
    return {popupNotification: null};
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

async function updateNewsletterPreference({data, state, api}) {
    if (noNewsletterOrCommentUpdates(data)) {
        return {};
    }

    const updateData = {};
    if (data.newsletters) {
        updateData.newsletters = data.newsletters;
    }
    if (data.enableCommentNotifications !== undefined) {
        updateData.enableCommentNotifications = data.enableCommentNotifications;
    }

    try {
        const member = await api.member.update(updateData);
        return {action: 'updateNewsletterPref:success', member};
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
        return {
            action: 'removeEmailFromSuppressionList:success',
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
    if (missingSubscribedFlag(data)) {
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

    try {
        const member = await api.member.update({subscribed: data.subscribed});
        if (missingMember(member)) {
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
    if (emailUnchanged(data, state)) {
        return null;
    }

    try {
        await api.member.updateEmailAddress({email: data.email});
        return {success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

async function updateMemberData({data, state, api}) {
    if (nameUnchanged(data, state)) {
        return null;
    }

    try {
        const member = await api.member.update({name: data.name.trim()});
        if (missingMember(member)) {
            throw new Error('Failed to update member');
        }
        return {member, success: true};
    } catch (err) {
        return {success: false, error: err};
    }
}

async function refreshMemberData({state, api}) {
    if (!hasMember(state)) {
        return null;
    }

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
    }

    if (dataUpdate) {
        const action = dataUpdate.success ? 'updateProfile:success' : 'updateProfile:failed';
        const status = dataUpdate.success ? 'success' : 'error';
        const message = dataUpdate.success
            ? t('Account details updated successfully')
            : t('Failed to update account details');

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

    if (emailUpdate) {
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

function trackRecommendationClicked({data, api}) {
    try {
        const existing = localStorage.getItem('ghost-recommendations-clicked');
        const clicked = existing ? JSON.parse(existing) : [];
        if (!clicked.includes(data.recommendationId)) {
            clicked.push(data.recommendationId);
            localStorage.setItem('ghost-recommendations-clicked', JSON.stringify(clicked));
        }
    } catch (e) {
        // ignore storage errors
    }
    api.recommendations.trackClicked({recommendationId: data.recommendationId});
    return {};
}

async function trackRecommendationSubscribed({data, api}) {
    api.recommendations.trackSubscribed({recommendationId: data.recommendationId});
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